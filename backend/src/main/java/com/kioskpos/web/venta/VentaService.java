package com.kioskpos.web.venta;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cliente.Cliente;
import com.kioskpos.web.cliente.ClienteService;
import com.kioskpos.web.cuadre.Turno;
import com.kioskpos.web.cuadre.TurnoRepository;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tasa.TasaNegocioService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Procesa una venta. El servidor es la autoridad (CLAUDE.md §2): recalcula los montos
 * con SUS precios, baja el stock de forma atómica, numera la factura por caja y exige
 * un permiso de cobro vigente (kill switch). Reenvíos con el mismo codigo_unico no
 * cobran dos veces (idempotencia para la cola offline).
 *
 * Portado de VentaService del escritorio, recortado a P1: sin turno/cuadre (Paso 7),
 * sin fiado/avances/recargas (P2), sin descuento ni redondeo todavía.
 */
@Service
public class VentaService {

    private final VentaRepository ventaRepository;
    private final ProductoRepository productoRepository;
    private final PermisoService permisoService;
    private final TurnoRepository turnoRepository;

    private final NegocioRepository negocioRepository;
    private final TasaNegocioService tasaNegocioService;
    private final ClienteService clienteService;
    private final com.kioskpos.web.suscripcion.SuscripcionService suscripcionService;
    private final com.kioskpos.web.inventario.PresentacionRepository presentacionRepository;
    private final com.kioskpos.web.recarga.RecargaService recargaService;
    private final com.kioskpos.web.cuadre.MovimientoCajaService movimientoCajaService;

    public VentaService(VentaRepository ventaRepository,
                        ProductoRepository productoRepository,
                        PermisoService permisoService,
                        TurnoRepository turnoRepository,
                        NegocioRepository negocioRepository,
                        TasaNegocioService tasaNegocioService,
                        ClienteService clienteService,
                        com.kioskpos.web.suscripcion.SuscripcionService suscripcionService,
                        com.kioskpos.web.inventario.PresentacionRepository presentacionRepository,
                        com.kioskpos.web.recarga.RecargaService recargaService,
                        com.kioskpos.web.cuadre.MovimientoCajaService movimientoCajaService) {
        this.recargaService = recargaService;
        this.movimientoCajaService = movimientoCajaService;
        this.suscripcionService = suscripcionService;
        this.presentacionRepository = presentacionRepository;
        this.ventaRepository = ventaRepository;
        this.productoRepository = productoRepository;
        this.permisoService = permisoService;
        this.turnoRepository = turnoRepository;
        this.negocioRepository = negocioRepository;
        this.tasaNegocioService = tasaNegocioService;
        this.clienteService = clienteService;
    }

    /**
     * presentacionId: si se vende un bloque (caja, media caja, saco...), cantidad = cuántos
     * bloques; el stock baja cantidad × lo que trae el bloque y el precio es el del bloque.
     */
    public record ItemInput(Long productoId, BigDecimal cantidad, BigDecimal precioUsd, String nombre, Long presentacionId) {
        public ItemInput(Long productoId, BigDecimal cantidad, BigDecimal precioUsd, String nombre) {
            this(productoId, cantidad, precioUsd, nombre, null);
        }
    }

    public record PagoInput(MetodoPago metodo, Moneda moneda, BigDecimal montoOriginal, String referencia) {
    }

    /**
     * creadoAt: cuándo se cobró en la caja (epoch ms). Viene en las ventas de la cola sin internet.
     * clienteId: a quién se le fía (obligatorio si algún pago es FIADO).
     */
    /** vueltoUsd: cuántos dólares del vuelto se entregan en $ (el resto, en Bs); null = automático. */
    public record VentaInput(String codigoUnico, BigDecimal tasaBcv,
                             List<ItemInput> items, List<PagoInput> pagos, Long creadoAt, Long clienteId,
                             List<ServicioInput> servicios, BigDecimal vueltoUsd) {
        public VentaInput(String codigoUnico, BigDecimal tasaBcv, List<ItemInput> items, List<PagoInput> pagos,
                          Long creadoAt, Long clienteId, List<ServicioInput> servicios) {
            this(codigoUnico, tasaBcv, items, pagos, creadoAt, clienteId, servicios, null);
        }

        public VentaInput(String codigoUnico, BigDecimal tasaBcv, List<ItemInput> items, List<PagoInput> pagos) {
            this(codigoUnico, tasaBcv, items, pagos, null, null, null);
        }

        public VentaInput(String codigoUnico, BigDecimal tasaBcv, List<ItemInput> items, List<PagoInput> pagos, Long creadoAt) {
            this(codigoUnico, tasaBcv, items, pagos, creadoAt, null, null);
        }

        public VentaInput(String codigoUnico, BigDecimal tasaBcv, List<ItemInput> items, List<PagoInput> pagos, Long creadoAt, Long clienteId) {
            this(codigoUnico, tasaBcv, items, pagos, creadoAt, clienteId, null);
        }
    }

    /**
     * Servicio cobrado dentro de la venta, en Bs exactos.
     * RECARGA: operadora + numero, montoBs = lo recargado, cobradoBs = lo que paga el cliente.
     * AVANCE: se le entrega efectivo (entregaMoneda USD/VES, entregaMonto), cobradoBs = lo que paga.
     */
    public record ServicioInput(String tipo, String operadora, String numero, BigDecimal montoBs,
                                String entregaMoneda, BigDecimal entregaMonto, BigDecimal cobradoBs) {
    }

    /** Servicio ya validado, listo para guardar después de la venta. */
    private record ServicioOk(ServicioInput in, String tipo, BigDecimal costoBs, BigDecimal cobradoBs, String moneda, BigDecimal entregado) {
    }

    /** Una venta cobrada hace más que esto llegó de la cola: el dinero ya se recibió con su tasa. */
    static final long MINUTOS_VENTA_EN_COLA = 10;

    @Transactional
    public Venta registrar(KioskPrincipal principal, String permisoToken, VentaInput input) {
        // 1. Kill switch: sin permiso vigente no se cobra.
        permisoService.exigirPermisoVigente(permisoToken, principal.negocioId(), principal.cajaId());
        return registrarValidada(principal, input);
    }

    /**
     * Fiar productos desde la libreta (perfil del cliente o trabajador), sin pasar por la
     * pantalla de cobro: el servidor calcula el total con SUS precios y lo anota todo como
     * FIADO. Baja el stock igual que una venta. Si quien fía está en una caja, la venta queda
     * en esa caja; si no (dueño desde el teléfono), queda sin caja.
     */
    @Transactional
    public Venta fiarDesdeLibreta(KioskPrincipal principal, Long clienteId, BigDecimal tasa, List<ItemInput> items) {
        var sit = suscripcionService.situacion(principal.negocioId());
        if (!sit.puedeCobrar()) {
            throw new com.kioskpos.web.permiso.PermisoDenegadoException("No se puede dar crédito: el plan de KioskPOS de este negocio "
                    + (sit.pagoHasta() == null ? "no está activado" : "venció el " + sit.pagoHasta())
                    + " (no es por el cliente). Reporta el pago en Más → Mi plan o pídele al administrador que lo registre.");
        }
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("Agrega al menos un producto");
        }
        BigDecimal total = BigDecimal.ZERO;
        for (ItemInput it : items) {
            if (it.productoId() == null || it.cantidad() == null || it.cantidad().signum() <= 0) {
                throw new IllegalArgumentException("Cantidad inválida");
            }
            Producto p = productoRepository.findById(it.productoId())
                    .orElseThrow(() -> new IllegalArgumentException("Producto no encontrado"));
            BigDecimal precio = it.presentacionId() == null ? p.getPrecioUsd() : presentacionDe(p, it.presentacionId()).getPrecioUsd();
            total = total.add(precio.multiply(it.cantidad()).setScale(2, RoundingMode.HALF_UP));
        }
        total = total.setScale(2, RoundingMode.HALF_UP);
        List<ItemInput> lineas = items.stream().map(it -> new ItemInput(it.productoId(), it.cantidad(), null, null, it.presentacionId())).toList();
        return registrarValidada(principal, new VentaInput(java.util.UUID.randomUUID().toString(), tasa, lineas,
                List.of(new PagoInput(MetodoPago.FIADO, Moneda.USD, total, null)), null, clienteId));
    }

    private com.kioskpos.web.inventario.Presentacion presentacionDe(Producto producto, Long presentacionId) {
        var pres = presentacionRepository.findById(presentacionId)
                .orElseThrow(() -> new IllegalArgumentException("La presentación de '" + producto.getNombre() + "' ya no existe. Recarga la caja."));
        if (!pres.getProductoId().equals(producto.getId())) {
            throw new IllegalArgumentException("La presentación no es de '" + producto.getNombre() + "'");
        }
        return pres;
    }

    private static ServicioOk validarServicio(ServicioInput sv, BigDecimal tasa) {
        String tipo = sv.tipo() == null ? "" : sv.tipo().trim().toUpperCase();
        BigDecimal cobrado = sv.cobradoBs() == null ? BigDecimal.ZERO : sv.cobradoBs().setScale(2, RoundingMode.HALF_UP);
        if ("RECARGA".equals(tipo)) {
            BigDecimal monto = sv.montoBs() == null ? BigDecimal.ZERO : sv.montoBs().setScale(2, RoundingMode.HALF_UP);
            if (monto.signum() <= 0) {
                throw new IllegalArgumentException("El monto de la recarga debe ser mayor a 0");
            }
            if (cobrado.compareTo(monto) < 0) {
                throw new IllegalArgumentException("Lo cobrado por la recarga no puede ser menor que lo recargado");
            }
            return new ServicioOk(sv, tipo, monto, cobrado, "VES", null);
        }
        if ("AVANCE".equals(tipo)) {
            String moneda = "USD".equals(sv.entregaMoneda()) ? "USD" : "VES";
            BigDecimal entregado = sv.entregaMonto() == null ? BigDecimal.ZERO : sv.entregaMonto().setScale(2, RoundingMode.HALF_UP);
            if (entregado.signum() <= 0) {
                throw new IllegalArgumentException("El efectivo del avance debe ser mayor a 0");
            }
            BigDecimal entregadoBs = "USD".equals(moneda) ? entregado.multiply(tasa).setScale(2, RoundingMode.HALF_UP) : entregado;
            if (cobrado.compareTo(entregadoBs) < 0) {
                throw new IllegalArgumentException("Lo cobrado por el avance no puede ser menor que el efectivo entregado");
            }
            return new ServicioOk(sv, tipo, entregadoBs, cobrado, moneda, entregado);
        }
        throw new IllegalArgumentException("Servicio desconocido (recarga o avance)");
    }

    private static String nombreServicio(ServicioOk ok) {
        if ("RECARGA".equals(ok.tipo())) {
            String op = ok.in().operadora() == null ? "" : ok.in().operadora().trim().toUpperCase().replace('_', ' ');
            String num = ok.in().numero() == null ? "" : ok.in().numero().replaceAll("[^0-9A-Za-z-]", "");
            String n = "Recarga " + op + " " + num;
            return n.length() > 150 ? n.substring(0, 150) : n;
        }
        java.text.DecimalFormatSymbols sym = new java.text.DecimalFormatSymbols(java.util.Locale.US);
        sym.setDecimalSeparator(',');
        sym.setGroupingSeparator('.');
        return "Avance de efectivo " + ("USD".equals(ok.moneda()) ? "$ " : "Bs ") + new java.text.DecimalFormat("#,##0.00", sym).format(ok.entregado());
    }

    /** "Cigarros Belmont (Caja x20)": lo que se lee en el ticket y en la factura. */
    static String nombreConBloque(String producto, com.kioskpos.web.inventario.Presentacion p) {
        String n = producto + " (" + p.getNombre() + " x" + p.getCantidad().stripTrailingZeros().toPlainString() + ")";
        return n.length() > 150 ? n.substring(0, 150) : n;
    }

    private Venta registrarValidada(KioskPrincipal principal, VentaInput input) {

        // 2. Idempotencia: un reenvío con el mismo código no cobra dos veces.
        if (input.codigoUnico() != null && !input.codigoUnico().isBlank()) {
            var existente = ventaRepository.findByCodigoUnico(input.codigoUnico());
            if (existente.isPresent()) {
                return existente.get();
            }
        }
        List<ItemInput> itemsIn = input.items() == null ? List.of() : input.items();
        List<ServicioInput> serviciosIn = input.servicios() == null ? List.of() : input.servicios();
        if (itemsIn.isEmpty() && serviciosIn.isEmpty()) {
            throw new IllegalArgumentException("La venta no tiene productos");
        }
        BigDecimal tasa = input.tasaBcv();
        if (tasa == null || tasa.signum() <= 0) {
            throw new IllegalArgumentException("La tasa del día debe ser mayor a 0");
        }
        // El servidor manda (CLAUDE.md §2): la tasa la decide el negocio, no la caja.
        // Una venta EN VIVO debe usar la tasa del negocio (±3%). Una que llega de la cola
        // sin internet ya se cobró: se acepta con su tasa para no perder el registro.
        boolean enVivo = input.creadoAt() == null
                || Duration.between(Instant.ofEpochMilli(input.creadoAt()), Instant.now())
                        .toMinutes() < MINUTOS_VENTA_EN_COLA;
        boolean enCola = !enVivo;
        if (enVivo) negocioRepository.findById(principal.negocioId()).ifPresent(n -> {
            BigDecimal delNegocio = tasaNegocioService.efectiva(n);
            if (!TasaNegocioService.dentroDelMargen(tasa, delNegocio)) {
                throw new IllegalArgumentException("La tasa usada (Bs " + tasa.stripTrailingZeros().toPlainString()
                        + ") no coincide con la del negocio (Bs " + delNegocio.stripTrailingZeros().toPlainString()
                        + "). Recarga la caja para tomar la tasa actual.");
            }
        });

        Venta venta = new Venta();
        venta.setNegocioId(principal.negocioId());
        venta.setCajaId(principal.cajaId());
        venta.setUsuarioId(principal.usuarioId());
        // Se ata al turno abierto de la caja (si hay), para que el cuadre la sume.
        if (principal.cajaId() != null) {
            turnoRepository.findFirstByCajaIdAndEstado(principal.cajaId(), Turno.Estado.ABIERTO.name())
                    .ifPresent(t -> venta.setTurnoId(t.getId()));
        }
        venta.setCodigoUnico(input.codigoUnico());
        venta.setTasaBcv(tasa);

        // 3. Líneas: el servidor pone el precio (autoridad), salvo el cobro rápido (por monto).
        BigDecimal totalUsd = BigDecimal.ZERO;
        for (ItemInput item : itemsIn) {
            BigDecimal cantidad = item.cantidad();
            if (cantidad == null || cantidad.signum() <= 0) {
                throw new IllegalArgumentException("Cantidad inválida");
            }
            DetalleVenta d = new DetalleVenta();
            d.setCantidad(cantidad);

            if (item.productoId() != null) {
                Producto producto = productoRepository.findById(item.productoId())
                        .orElseThrow(() -> new IllegalArgumentException("Producto no encontrado"));
                if (!producto.isActivo()) {
                    throw new IllegalArgumentException("El producto '" + producto.getNombre() + "' está inactivo");
                }
                // Bloque (caja, media caja...): cantidad = bloques; el stock baja en unidades.
                com.kioskpos.web.inventario.Presentacion pres = item.presentacionId() == null ? null : presentacionDe(producto, item.presentacionId());
                BigDecimal unidades = pres == null ? BigDecimal.ONE : pres.getCantidad();
                BigDecimal mueve = cantidad.multiply(unidades);
                int filas = productoRepository.descontarStock(producto.getId(), mueve);
                if (filas == 0) {
                    if (!enCola) {
                        throw new IllegalStateException("Stock insuficiente de '" + producto.getNombre() + "'");
                    }
                    // Venta que llega de la cola sin internet: el dinero YA se cobró. Se registra
                    // igual (el stock queda en negativo y el dueño lo ve en Inventario) en vez de
                    // perder la venta.
                    productoRepository.sumarStock(producto.getId(), mueve.negate());
                }
                d.setProductoId(producto.getId());
                d.setNombre(pres == null ? producto.getNombre() : nombreConBloque(producto.getNombre(), pres));
                d.setUnidades(unidades);
                // En vivo manda el precio del servidor; si la venta viene de la cola, el precio
                // con el que la caja cobró (el catálogo pudo cambiar mientras estaba sin internet).
                BigDecimal delServidor = pres == null ? producto.getPrecioUsd() : pres.getPrecioUsd();
                d.setPrecioUnitarioUsd(enCola && item.precioUsd() != null && item.precioUsd().signum() > 0
                        ? item.precioUsd().setScale(2, RoundingMode.HALF_UP) : delServidor);
                d.setCostoUnitarioUsd(producto.getCostoUsd() == null ? null : producto.getCostoUsd().multiply(unidades));
            } else {
                // Cobro rápido: artículo sin catálogo, cobrado por monto.
                if (item.precioUsd() == null || item.precioUsd().signum() <= 0) {
                    throw new IllegalArgumentException("El cobro rápido necesita un monto mayor a 0");
                }
                if (item.nombre() == null || item.nombre().isBlank()) {
                    throw new IllegalArgumentException("El cobro rápido necesita un nombre");
                }
                d.setProductoId(null);
                d.setNombre(item.nombre().trim());
                d.setPrecioUnitarioUsd(item.precioUsd().setScale(2, RoundingMode.HALF_UP));
            }

            BigDecimal subtotal = d.getPrecioUnitarioUsd().multiply(cantidad).setScale(2, RoundingMode.HALF_UP);
            d.setSubtotalUsd(subtotal);
            totalUsd = totalUsd.add(subtotal);
            venta.addDetalle(d);
        }

        totalUsd = totalUsd.setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalBs = totalUsd.multiply(tasa).setScale(2, RoundingMode.HALF_UP);

        // 3b. Servicios (recargas y avances) en Bs exactos: una línea cada uno en la venta.
        List<ServicioOk> servicios = new ArrayList<>();
        BigDecimal serviciosBs = BigDecimal.ZERO;
        for (ServicioInput sv : serviciosIn) {
            ServicioOk ok = validarServicio(sv, tasa);
            servicios.add(ok);
            serviciosBs = serviciosBs.add(ok.cobradoBs());
            DetalleVenta d = new DetalleVenta();
            d.setCantidad(BigDecimal.ONE);
            d.setProductoId(null);
            d.setServicio(ok.tipo());
            d.setMontoBs(ok.cobradoBs());
            d.setNombre(nombreServicio(ok));
            BigDecimal enUsd = ok.cobradoBs().divide(tasa, 2, RoundingMode.HALF_UP);
            d.setPrecioUnitarioUsd(enUsd);
            d.setSubtotalUsd(enUsd);
            // La ganancia de recargas/avances se cuenta aparte (su comisión): aquí margen 0.
            d.setCostoUnitarioUsd(ok.cobradoBs().divide(tasa, 4, RoundingMode.HALF_UP));
            venta.addDetalle(d);
        }
        BigDecimal totalBsExacto = null;
        if (!servicios.isEmpty()) {
            totalBs = totalBs.add(serviciosBs).setScale(2, RoundingMode.HALF_UP);
            totalUsd = totalBs.divide(tasa, 2, RoundingMode.HALF_UP);
            totalBsExacto = totalBs;
        }
        venta.setTotalUsd(totalUsd);
        venta.setTotalBs(totalBs);

        // 4. Pagos: validar que cubren el total y calcular el vuelto.
        //    Lo FIADO (en USD) se descuenta del total; el resto se cobra normal. El vuelto
        //    solo sale de lo pagado de verdad, nunca del fiado.
        List<PagoInput> pagosIn = input.pagos() == null ? List.of() : input.pagos();
        BigDecimal fiadoUsd = BigDecimal.ZERO;
        List<CobroCalculadora.Pago> pagosCobro = new ArrayList<>();
        for (PagoInput p : pagosIn) {
            if (p.metodo() == null || p.moneda() == null || p.montoOriginal() == null || p.montoOriginal().signum() < 0) {
                throw new IllegalArgumentException("Pago inválido");
            }
            if (p.metodo() == MetodoPago.FIADO) {
                if (p.moneda() != Moneda.USD) {
                    throw new IllegalArgumentException("El crédito se anota en dólares");
                }
                fiadoUsd = fiadoUsd.add(p.montoOriginal().setScale(2, RoundingMode.HALF_UP));
            } else {
                pagosCobro.add(new CobroCalculadora.Pago(p.moneda(), p.montoOriginal()));
            }
        }
        Cliente clienteFiado = null;
        if (fiadoUsd.signum() > 0) {
            if (fiadoUsd.compareTo(totalUsd) > 0) {
                throw new IllegalArgumentException("El crédito no puede ser mayor que el total de la venta");
            }
            clienteFiado = clienteService.validarFiado(input.clienteId(), fiadoUsd);
            venta.setClienteId(clienteFiado.getId());
        }
        CobroCalculadora.Resultado cobro = CobroCalculadora.calcular(totalUsd.subtract(fiadoUsd),
                totalBsExacto == null || fiadoUsd.signum() > 0 ? null : totalBsExacto, tasa, pagosCobro, input.vueltoUsd());
        if (!cobro.cubre()) {
            throw new IllegalArgumentException(String.format(
                    "Pago insuficiente. Falta cubrir el total de $%.2f (Bs. %.2f)", totalUsd, totalBs));
        }
        venta.setVueltoUsd(cobro.vueltoUsd());
        venta.setVueltoBs(cobro.vueltoBs());

        for (PagoInput p : pagosIn) {
            PagoVenta pago = new PagoVenta();
            pago.setMetodo(p.metodo());
            pago.setMoneda(p.moneda());
            BigDecimal monto = p.montoOriginal().setScale(2, RoundingMode.HALF_UP);
            pago.setMontoOriginal(monto);
            pago.setEquivalenteUsd(p.moneda() == Moneda.USD
                    ? monto
                    : monto.divide(tasa, 2, RoundingMode.HALF_UP));
            pago.setReferencia(p.metodo() == MetodoPago.FIADO ? clienteFiado.getNombre() : p.referencia());
            venta.addPago(pago);
        }

        // 5. Número de factura correlativo POR CAJA.
        venta.setNumeroFactura((principal.cajaId() == null ? ventaRepository.maxNumeroFacturaSinCaja()
                : ventaRepository.maxNumeroFacturaDeCaja(principal.cajaId())) + 1);

        Venta guardada = ventaRepository.save(venta);
        // Recargas y avances: su registro (comisión, número, efectivo que sale de la gaveta).
        if (!servicios.isEmpty()) {
            Turno turno = guardada.getTurnoId() == null ? null : turnoRepository.findById(guardada.getTurnoId()).orElse(null);
            if (turno == null) {
                throw new IllegalStateException("Abre la caja para cobrar recargas o avances");
            }
            for (ServicioOk ok : servicios) {
                if ("RECARGA".equals(ok.tipo())) {
                    recargaService.registrarDeVenta(principal.negocioId(), turno.getId(), principal.cajaId(), principal.usuarioId(),
                            guardada.getId(), ok.in().operadora(), ok.in().numero(), ok.costoBs(), ok.cobradoBs(), tasa);
                } else {
                    movimientoCajaService.registrarAvanceDeVenta(principal.negocioId(), turno, principal.usuarioId(), guardada.getId(),
                            ok.moneda(), ok.entregado(), ok.costoBs(), ok.cobradoBs(), tasa, !enCola);
                }
            }
        }
        if (clienteFiado != null) {
            clienteService.cargar(clienteFiado.getId(), fiadoUsd, guardada.getId(), guardada.getTurnoId(),
                    principal.cajaId(), principal.usuarioId());
        }
        return guardada;
    }

    @Transactional(readOnly = true)
    public Venta buscar(Long id) {
        Venta v = ventaRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Venta no encontrada"));
        v.getDetalles().size();
        v.getPagos().size();
        return v;
    }

    /** Ventas de un día: las de la caja de la sesión, o todas si es el dueño/encargado sin caja. */
    @Transactional(readOnly = true)
    public List<Venta> ventasDelDia(KioskPrincipal principal, java.time.LocalDate fecha) {
        java.time.ZoneId zona = java.time.ZoneId.of("America/Caracas");
        java.time.LocalDate d = fecha != null ? fecha : java.time.LocalDate.now(zona);
        Instant desde = d.atStartOfDay(zona).toInstant();
        Instant hasta = d.plusDays(1).atStartOfDay(zona).toInstant();
        List<Venta> l = ventaRepository.findByFechaHoraBetweenOrderByFechaHoraDesc(desde, hasta).stream()
                .filter(v -> principal.cajaId() == null || principal.cajaId().equals(v.getCajaId()))
                .toList();
        l.forEach(v -> { v.getDetalles().size(); v.getPagos().size(); });
        return l;
    }

    @Transactional(readOnly = true)
    public List<Venta> buscarPorNumero(KioskPrincipal principal, Integer numero) {
        if (numero == null) {
            return List.of();
        }
        List<Venta> l = ventaRepository.findByNumeroFacturaOrderByFechaHoraDesc(numero).stream()
                .filter(v -> principal.cajaId() == null || principal.cajaId().equals(v.getCajaId()))
                .toList();
        l.forEach(v -> { v.getDetalles().size(); v.getPagos().size(); });
        return l;
    }

    @Transactional(readOnly = true)
    public List<Venta> ventasDeCaja(Long cajaId) {
        return ventaRepository.findByCajaIdOrderByFechaHoraDesc(cajaId);
    }
}
