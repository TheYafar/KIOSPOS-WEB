package com.kioskpos.web.devolucion;

import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cliente.ClienteService;
import com.kioskpos.web.cuadre.CuadreService;
import com.kioskpos.web.cuadre.Turno;
import com.kioskpos.web.cuadre.TurnoRepository;
import com.kioskpos.web.inventario.InventarioService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import com.kioskpos.web.venta.DetalleVenta;
import com.kioskpos.web.venta.MetodoPago;
import com.kioskpos.web.venta.PagoVenta;
import com.kioskpos.web.venta.Venta;
import com.kioskpos.web.venta.VentaRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Anular ventas y devoluciones (portado de DevolucionService del escritorio).
 *
 * - ANULAR: para errores al cobrar. Solo mientras el turno de la venta siga abierto (si
 *   ya se cerró, el cierre no se toca: se hace una devolución). La venta queda ANULADA,
 *   sale del cuadre y de los reportes, la mercancía vuelve al stock y lo fiado se descuenta.
 * - DEVOLVER: parcial o total, cualquier día. Vuelve la mercancía y se reembolsa en
 *   efectivo ($ o Bs, sale de la gaveta del turno abierto), a la cuenta del cliente (fiado)
 *   o "fuera de caja" (solo dueño/encargado). Nunca se devuelve más de lo vendido.
 */
@Service
public class DevolucionService {

    private static final Set<String> METODOS = Set.of("COMO_PAGO", "EFECTIVO_USD", "EFECTIVO_BS", "PAGO_MOVIL", "PUNTO",
            "BIOPAGO", "A_CUENTA", "FUERA_DE_CAJA");
    /** Formas de reembolso que salen de la caja (efectivo de la gaveta o lo que reporta el banco del turno). */
    private static final Set<String> DE_CAJA = Set.of("EFECTIVO_USD", "EFECTIVO_BS", "PAGO_MOVIL", "PUNTO", "BIOPAGO", "OTRO");

    private final VentaRepository ventas;
    private final TurnoRepository turnos;
    private final ProductoRepository productos;
    private final InventarioService inventario;
    private final ClienteService clientes;
    private final CuadreService cuadre;
    private final DevolucionRepository devoluciones;
    private final DevolucionDetalleRepository detalles;
    private final DevolucionReembolsoRepository reembolsos;

    public DevolucionService(VentaRepository ventas, TurnoRepository turnos, ProductoRepository productos,
                             InventarioService inventario, ClienteService clientes, CuadreService cuadre,
                             DevolucionRepository devoluciones, DevolucionDetalleRepository detalles,
                             DevolucionReembolsoRepository reembolsos) {
        this.reembolsos = reembolsos;
        this.ventas = ventas;
        this.turnos = turnos;
        this.productos = productos;
        this.inventario = inventario;
        this.clientes = clientes;
        this.cuadre = cuadre;
        this.devoluciones = devoluciones;
        this.detalles = detalles;
    }

    public record ItemDevolucion(Long detalleId, BigDecimal cantidad) {
    }

    /** metodoReembolso: COMO_PAGO (igual que pagó, repartido), un método, A_CUENTA o FUERA_DE_CAJA. */
    public record NuevaDevolucion(List<ItemDevolucion> items, String metodoReembolso, String motivo, String referencia) {
        public NuevaDevolucion(List<ItemDevolucion> items, String metodoReembolso, String motivo) {
            this(items, metodoReembolso, motivo, null);
        }
    }

    public record DevolucionHecha(Devolucion devolucion, List<DevolucionReembolso> reembolsos) {
    }

    public record LineaVenta(Long detalleId, Long productoId, String nombre, BigDecimal cantidad,
                             BigDecimal precioUsd, BigDecimal subtotalUsd, BigDecimal devuelto) {
    }

    public record PagoLinea(String metodo, String moneda, BigDecimal monto, String referencia) {
    }

    public record DetalleVentaVista(Long id, Integer numeroFactura, Instant fechaHora, String estado, Long cajaId,
                                    Long turnoId, boolean turnoAbierto, BigDecimal tasa, BigDecimal totalUsd,
                                    BigDecimal totalBs, BigDecimal vueltoUsd, BigDecimal vueltoBs, Long clienteId,
                                    String motivoAnulacion, List<LineaVenta> lineas, List<PagoLinea> pagos,
                                    List<DevolucionHecha> devoluciones, BigDecimal devueltoUsd) {
    }

    @Transactional(readOnly = true)
    public DetalleVentaVista detalle(Long ventaId) {
        Venta v = cargar(ventaId);
        Map<Long, BigDecimal> devuelto = devueltoPorLinea(ventaId);
        List<Devolucion> devs = devoluciones.findByVentaIdOrderByIdAsc(ventaId);
        Map<Long, List<DevolucionReembolso>> partes = new HashMap<>();
        if (!devs.isEmpty()) {
            for (DevolucionReembolso r : reembolsos.findByDevolucionIdIn(devs.stream().map(Devolucion::getId).toList())) {
                partes.computeIfAbsent(r.getDevolucionId(), k -> new java.util.ArrayList<>()).add(r);
            }
        }
        boolean abierto = v.getTurnoId() != null && turnos.findById(v.getTurnoId())
                .map(t -> Turno.Estado.ABIERTO.name().equals(t.getEstado())).orElse(false);
        return new DetalleVentaVista(v.getId(), v.getNumeroFactura(), v.getFechaHora(), v.getEstado(), v.getCajaId(),
                v.getTurnoId(), abierto, v.getTasaBcv(), v.getTotalUsd(), v.getTotalBs(), v.getVueltoUsd(), v.getVueltoBs(),
                v.getClienteId(), v.getMotivoAnulacion(),
                v.getDetalles().stream().map(d -> new LineaVenta(d.getId(), d.getProductoId(), d.getNombre(), d.getCantidad(),
                        d.getPrecioUnitarioUsd(), d.getSubtotalUsd(), devuelto.getOrDefault(d.getId(), BigDecimal.ZERO))).toList(),
                v.getPagos().stream().map(p -> new PagoLinea(p.getMetodo().name(), p.getMoneda().name(), p.getMontoOriginal(),
                        p.getReferencia())).toList(),
                devs.stream().map(d -> new DevolucionHecha(d, partes.getOrDefault(d.getId(), List.of()))).toList(),
                devs.stream().map(Devolucion::getTotalUsd).reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    /** Lo ya devuelto de cada venta (para la lista de ventas). */
    @Transactional(readOnly = true)
    public Map<Long, BigDecimal> devueltoPorVenta(List<Long> ventaIds) {
        Map<Long, BigDecimal> r = new HashMap<>();
        if (ventaIds.isEmpty()) {
            return r;
        }
        for (Devolucion d : devoluciones.findByVentaIdIn(ventaIds)) {
            r.merge(d.getVentaId(), d.getTotalUsd(), BigDecimal::add);
        }
        return r;
    }

    @Transactional
    public Venta anular(KioskPrincipal principal, Long ventaId, String motivo) {
        Venta v = cargar(ventaId);
        if (!"COMPLETADA".equals(v.getEstado())) {
            throw new IllegalStateException("La venta ya está anulada");
        }
        exigirPermisoSobre(principal, v);
        if (v.getTurnoId() != null) {
            Turno t = turnos.findById(v.getTurnoId()).orElseThrow();
            if (!Turno.Estado.ABIERTO.name().equals(t.getEstado())) {
                throw new IllegalStateException("El turno de esa venta ya se cerró. Usa “Devolver” en vez de anular.");
            }
        }
        if (!devoluciones.findByVentaIdOrderByIdAsc(ventaId).isEmpty()) {
            throw new IllegalStateException("Esa venta ya tiene devoluciones; devuelve el resto en vez de anular");
        }
        if (motivo == null || motivo.isBlank()) {
            throw new IllegalArgumentException("Escribe por qué se anula");
        }
        Long usuario = principal == null ? null : principal.usuarioId();
        for (DetalleVenta d : v.getDetalles()) {
            reponer(d.getProductoId(), d.getCantidad(), "ANULA_VENTA", "Venta #" + v.getNumeroFactura(), "Venta anulada", usuario);
        }
        BigDecimal fiado = fiadoDe(v);
        if (v.getClienteId() != null && fiado.signum() > 0) {
            clientes.descontarPorVenta(v.getClienteId(), fiado, v.getId(), "ANULACION", usuario);
        }
        v.setEstado("ANULADA");
        v.setAnuladaPor(usuario);
        v.setMotivoAnulacion(motivo.trim().length() > 200 ? motivo.trim().substring(0, 200) : motivo.trim());
        return ventas.save(v);
    }

    @Transactional
    public DevolucionHecha devolver(KioskPrincipal principal, Long ventaId, NuevaDevolucion in) {
        Venta v = cargar(ventaId);
        if (!"COMPLETADA".equals(v.getEstado())) {
            throw new IllegalStateException("No se puede devolver una venta anulada");
        }
        String metodo = in.metodoReembolso();
        if (metodo == null || !METODOS.contains(metodo)) {
            throw new IllegalArgumentException("¿Cómo le devuelves el dinero?");
        }
        if (in.items() == null || in.items().isEmpty()) {
            throw new IllegalArgumentException("Elige qué productos devuelve");
        }
        Map<Long, DetalleVenta> porId = new HashMap<>();
        v.getDetalles().forEach(d -> porId.put(d.getId(), d));
        Map<Long, BigDecimal> yaDevuelto = devueltoPorLinea(ventaId);

        Long negocioId = NegocioContext.require();
        Long usuario = principal == null ? null : principal.usuarioId();
        BigDecimal total = BigDecimal.ZERO;
        Map<DetalleVenta, BigDecimal> cantidades = new HashMap<>();
        for (ItemDevolucion it : in.items()) {
            DetalleVenta d = porId.get(it.detalleId());
            if (d == null) {
                throw new IllegalArgumentException("Ese producto no está en la venta");
            }
            BigDecimal cant = it.cantidad() == null ? BigDecimal.ZERO : it.cantidad();
            if (cant.signum() <= 0) {
                continue;
            }
            BigDecimal queda = d.getCantidad().subtract(yaDevuelto.getOrDefault(d.getId(), BigDecimal.ZERO))
                    .subtract(cantidades.getOrDefault(d, BigDecimal.ZERO));
            if (cant.compareTo(queda) > 0) {
                throw new IllegalArgumentException("De \"" + d.getNombre() + "\" solo se pueden devolver "
                        + queda.stripTrailingZeros().toPlainString());
            }
            cantidades.merge(d, cant, BigDecimal::add);
            total = total.add(d.getPrecioUnitarioUsd().multiply(cant));
        }
        total = total.setScale(2, RoundingMode.HALF_UP);
        if (total.signum() <= 0) {
            throw new IllegalArgumentException("Elige qué productos devuelve");
        }

        // ¿Cómo se devuelve el dinero? Se arma la lista de partes del reembolso.
        BigDecimal tasaVenta = v.getTasaBcv();
        List<RepartoReembolso.Parte> partes;
        switch (metodo) {
            case "COMO_PAGO" -> partes = RepartoReembolso.repartir(
                    v.getPagos().stream().map(p -> new RepartoReembolso.Pago(p.getMetodo().name(), p.getMoneda().name(), p.getMontoOriginal())).toList(),
                    v.getVueltoUsd(), v.getVueltoBs(), tasaVenta, v.getTotalUsd(), total);
            case "EFECTIVO_USD" -> partes = List.of(new RepartoReembolso.Parte("EFECTIVO_USD", "USD", total));
            case "EFECTIVO_BS", "PAGO_MOVIL", "PUNTO", "BIOPAGO" -> partes = List.of(new RepartoReembolso.Parte(metodo, "VES",
                    total.multiply(tasaVenta).setScale(2, RoundingMode.HALF_UP))); // a la tasa de la venta: recibe lo que pagó
            case "A_CUENTA" -> {
                if (v.getClienteId() == null) {
                    throw new IllegalArgumentException("Esa venta no fue fiada: devuelve como pagó o en efectivo");
                }
                partes = List.of(new RepartoReembolso.Parte("A_CUENTA", "USD", total));
            }
            default -> { // FUERA_DE_CAJA
                if (principal == null || !(principal.rol() == RolUsuario.DUENO || principal.rol() == RolUsuario.ENCARGADO)) {
                    throw new IllegalArgumentException("Solo el dueño o el encargado registra devoluciones fuera de caja");
                }
                partes = List.of(new RepartoReembolso.Parte("FUERA_DE_CAJA", "USD", total));
            }
        }
        if (partes.isEmpty()) {
            throw new IllegalArgumentException("No hay nada que reembolsar");
        }

        // Lo que sale de la caja exige el turno abierto de ESTA caja (y efectivo suficiente).
        Long turnoId = null;
        if (partes.stream().anyMatch(p -> DE_CAJA.contains(p.metodo()))) {
            if (principal == null || principal.cajaId() == null) {
                throw new IllegalArgumentException("Para devolver dinero hazlo desde una caja abierta");
            }
            Turno t = turnos.findFirstByCajaIdAndEstado(principal.cajaId(), Turno.Estado.ABIERTO.name())
                    .orElseThrow(() -> new IllegalStateException("La caja está cerrada. Ábrela para devolver dinero."));
            var r = cuadre.resumen(t.getId());
            for (RepartoReembolso.Parte p : partes) {
                BigDecimal hay = "EFECTIVO_USD".equals(p.metodo()) ? r.esperadoUsd() : "EFECTIVO_BS".equals(p.metodo()) ? r.esperadoBs() : null;
                if (hay != null && p.monto().compareTo(hay) > 0) {
                    throw new IllegalArgumentException("No hay suficiente efectivo en " + ("USD".equals(p.moneda()) ? "dólares" : "bolívares")
                            + " en la caja para devolver (hay " + hay.toPlainString() + ")");
                }
            }
            turnoId = t.getId();
        }
        // Lo fiado vuelve a la cuenta del cliente.
        for (RepartoReembolso.Parte p : partes) {
            if ("A_CUENTA".equals(p.metodo())) {
                if (v.getClienteId() == null) {
                    throw new IllegalArgumentException("Esa venta no tiene cliente");
                }
                if (clientes.saldoDe(v.getClienteId()).compareTo(p.monto()) < 0 && "A_CUENTA".equals(metodo)) {
                    throw new IllegalArgumentException("El cliente debe menos de lo que se devuelve: devuelve como pagó o en efectivo");
                }
                clientes.descontarPorVenta(v.getClienteId(), p.monto(), v.getId(), "DEVOLUCION", usuario);
            }
        }

        Devolucion dev = new Devolucion();
        dev.setNegocioId(negocioId);
        dev.setVentaId(v.getId());
        dev.setUsuarioId(usuario);
        dev.setTotalUsd(total);
        dev.setMetodoReembolso(metodo);
        dev.setTasa(tasaVenta);
        dev.setTurnoId(turnoId);
        dev.setCajaId(turnoId == null ? null : principal.cajaId());
        dev.setMontoReembolso(partes.size() == 1 ? partes.get(0).monto() : total);
        dev.setMotivo(in.motivo() == null ? null : in.motivo().trim().length() > 200 ? in.motivo().trim().substring(0, 200) : in.motivo().trim());
        dev = devoluciones.save(dev);
        String ref = in.referencia() == null || in.referencia().isBlank() ? null : in.referencia().trim();
        for (RepartoReembolso.Parte p : partes) {
            DevolucionReembolso rr = new DevolucionReembolso();
            rr.setNegocioId(negocioId);
            rr.setDevolucionId(dev.getId());
            rr.setMetodo(p.metodo());
            rr.setMoneda(p.moneda());
            rr.setMonto(p.monto());
            rr.setReferencia("PAGO_MOVIL".equals(p.metodo()) && ref != null ? (ref.length() > 100 ? ref.substring(0, 100) : ref) : null);
            reembolsos.save(rr);
        }

        for (Map.Entry<DetalleVenta, BigDecimal> e : cantidades.entrySet()) {
            DetalleVenta d = e.getKey();
            DevolucionDetalle dd = new DevolucionDetalle();
            dd.setNegocioId(negocioId);
            dd.setDevolucionId(dev.getId());
            dd.setDetalleVentaId(d.getId());
            dd.setProductoId(d.getProductoId());
            dd.setCantidad(e.getValue());
            dd.setMontoUsd(d.getPrecioUnitarioUsd().multiply(e.getValue()).setScale(2, RoundingMode.HALF_UP));
            detalles.save(dd);
            reponer(d.getProductoId(), e.getValue(), "DEVOLUCION", "Venta #" + v.getNumeroFactura(), "Devolución de cliente", usuario);
        }
        return new DevolucionHecha(dev, reembolsos.findByDevolucionIdIn(List.of(dev.getId())));
    }

    private void reponer(Long productoId, BigDecimal cantidad, String tipo, String ref, String desc, Long usuario) {
        if (productoId == null) {
            return; // cobro rápido o producto borrado: no hay stock que reponer
        }
        Producto p = productos.findById(productoId).orElse(null);
        if (p == null) {
            return;
        }
        productos.sumarStock(p.getId(), cantidad);
        inventario.registrarMovimiento(p, tipo, cantidad, p.getStockActual(), p.getStockActual().add(cantidad), ref, desc, usuario);
    }

    private Map<Long, BigDecimal> devueltoPorLinea(Long ventaId) {
        List<Long> ids = devoluciones.findByVentaIdOrderByIdAsc(ventaId).stream().map(Devolucion::getId).toList();
        Map<Long, BigDecimal> r = new HashMap<>();
        if (!ids.isEmpty()) {
            for (DevolucionDetalle d : detalles.findByDevolucionIdIn(ids)) {
                r.merge(d.getDetalleVentaId(), d.getCantidad(), BigDecimal::add);
            }
        }
        return r;
    }

    private static BigDecimal fiadoDe(Venta v) {
        return v.getPagos().stream().filter(p -> p.getMetodo() == MetodoPago.FIADO)
                .map(PagoVenta::getMontoOriginal).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** El cajero solo puede anular ventas de SU caja; dueño/encargado, cualquiera. */
    private static void exigirPermisoSobre(KioskPrincipal p, Venta v) {
        if (p == null) {
            throw new IllegalArgumentException("Sin sesión");
        }
        boolean jefe = p.rol() == RolUsuario.DUENO || p.rol() == RolUsuario.ENCARGADO;
        if (!jefe && (p.cajaId() == null || !p.cajaId().equals(v.getCajaId()))) {
            throw new IllegalArgumentException("Solo puedes anular ventas de tu caja");
        }
    }

    private Venta cargar(Long id) {
        Venta v = ventas.findById(id).orElseThrow(() -> new IllegalArgumentException("Venta no encontrada"));
        v.getDetalles().size();
        v.getPagos().size();
        return v;
    }
}
