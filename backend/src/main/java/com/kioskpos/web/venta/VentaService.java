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

    public VentaService(VentaRepository ventaRepository,
                        ProductoRepository productoRepository,
                        PermisoService permisoService,
                        TurnoRepository turnoRepository,
                        NegocioRepository negocioRepository,
                        TasaNegocioService tasaNegocioService,
                        ClienteService clienteService) {
        this.ventaRepository = ventaRepository;
        this.productoRepository = productoRepository;
        this.permisoService = permisoService;
        this.turnoRepository = turnoRepository;
        this.negocioRepository = negocioRepository;
        this.tasaNegocioService = tasaNegocioService;
        this.clienteService = clienteService;
    }

    public record ItemInput(Long productoId, BigDecimal cantidad, BigDecimal precioUsd, String nombre) {
    }

    public record PagoInput(MetodoPago metodo, Moneda moneda, BigDecimal montoOriginal, String referencia) {
    }

    /**
     * creadoAt: cuándo se cobró en la caja (epoch ms). Viene en las ventas de la cola sin internet.
     * clienteId: a quién se le fía (obligatorio si algún pago es FIADO).
     */
    public record VentaInput(String codigoUnico, BigDecimal tasaBcv,
                             List<ItemInput> items, List<PagoInput> pagos, Long creadoAt, Long clienteId) {
        public VentaInput(String codigoUnico, BigDecimal tasaBcv, List<ItemInput> items, List<PagoInput> pagos) {
            this(codigoUnico, tasaBcv, items, pagos, null, null);
        }

        public VentaInput(String codigoUnico, BigDecimal tasaBcv, List<ItemInput> items, List<PagoInput> pagos, Long creadoAt) {
            this(codigoUnico, tasaBcv, items, pagos, creadoAt, null);
        }
    }

    /** Una venta cobrada hace más que esto llegó de la cola: el dinero ya se recibió con su tasa. */
    static final long MINUTOS_VENTA_EN_COLA = 10;

    @Transactional
    public Venta registrar(KioskPrincipal principal, String permisoToken, VentaInput input) {
        // 1. Kill switch: sin permiso vigente no se cobra.
        permisoService.exigirPermisoVigente(permisoToken, principal.negocioId(), principal.cajaId());

        // 2. Idempotencia: un reenvío con el mismo código no cobra dos veces.
        if (input.codigoUnico() != null && !input.codigoUnico().isBlank()) {
            var existente = ventaRepository.findByCodigoUnico(input.codigoUnico());
            if (existente.isPresent()) {
                return existente.get();
            }
        }
        if (input.items() == null || input.items().isEmpty()) {
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
        turnoRepository.findFirstByCajaIdAndEstado(principal.cajaId(), Turno.Estado.ABIERTO.name())
                .ifPresent(t -> venta.setTurnoId(t.getId()));
        venta.setCodigoUnico(input.codigoUnico());
        venta.setTasaBcv(tasa);

        // 3. Líneas: el servidor pone el precio (autoridad), salvo el cobro rápido (por monto).
        BigDecimal totalUsd = BigDecimal.ZERO;
        for (ItemInput item : input.items()) {
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
                int filas = productoRepository.descontarStock(producto.getId(), cantidad);
                if (filas == 0) {
                    throw new IllegalStateException("Stock insuficiente de '" + producto.getNombre() + "'");
                }
                d.setProductoId(producto.getId());
                d.setNombre(producto.getNombre());
                d.setPrecioUnitarioUsd(producto.getPrecioUsd());
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
                    throw new IllegalArgumentException("El fiado se anota en dólares");
                }
                fiadoUsd = fiadoUsd.add(p.montoOriginal().setScale(2, RoundingMode.HALF_UP));
            } else {
                pagosCobro.add(new CobroCalculadora.Pago(p.moneda(), p.montoOriginal()));
            }
        }
        Cliente clienteFiado = null;
        if (fiadoUsd.signum() > 0) {
            if (fiadoUsd.compareTo(totalUsd) > 0) {
                throw new IllegalArgumentException("Lo fiado no puede ser mayor que el total de la venta");
            }
            clienteFiado = clienteService.validarFiado(input.clienteId(), fiadoUsd);
            venta.setClienteId(clienteFiado.getId());
        }
        CobroCalculadora.Resultado cobro = CobroCalculadora.calcular(totalUsd.subtract(fiadoUsd), tasa, pagosCobro);
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
        venta.setNumeroFactura(ventaRepository.maxNumeroFacturaDeCaja(principal.cajaId()) + 1);

        Venta guardada = ventaRepository.save(venta);
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

    @Transactional(readOnly = true)
    public List<Venta> ventasDeCaja(Long cajaId) {
        return ventaRepository.findByCajaIdOrderByFechaHoraDesc(cajaId);
    }
}
