package com.kioskpos.web.venta.web;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.venta.MetodoPago;
import com.kioskpos.web.venta.Moneda;
import com.kioskpos.web.venta.TicketService;
import com.kioskpos.web.venta.Venta;
import com.kioskpos.web.venta.VentaService;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * API de ventas. Cobrar exige sesión de caja (JWT con cajaId) y el permiso de cobro
 * vigente en el header X-Permiso (kill switch del Paso 4).
 */
@RestController
@RequestMapping("/api/ventas")
public class VentaController {

    private final VentaService ventaService;
    private final TicketService ticketService;

    private final com.kioskpos.web.devolucion.DevolucionService devolucionService;

    public VentaController(VentaService ventaService, TicketService ticketService,
                           com.kioskpos.web.devolucion.DevolucionService devolucionService) {
        this.devolucionService = devolucionService;
        this.ventaService = ventaService;
        this.ticketService = ticketService;
    }

    @PostMapping
    public VentaResponse cobrar(@AuthenticationPrincipal KioskPrincipal principal,
                                @RequestHeader(value = "X-Permiso", required = false) String permiso,
                                @RequestBody RegistrarVentaRequest req) {
        if (principal == null || principal.cajaId() == null) {
            throw new IllegalArgumentException("Solo una caja puede cobrar");
        }
        List<VentaService.ItemInput> items = (req.items() == null ? List.<ItemRequest>of() : req.items()).stream()
                .map(i -> new VentaService.ItemInput(i.productoId(), i.cantidad(), i.precioUsd(), i.nombre(), i.presentacionId()))
                .toList();
        List<VentaService.PagoInput> pagos = req.pagos().stream()
                .map(p -> new VentaService.PagoInput(p.metodo(), p.moneda(), p.montoOriginal(), p.referencia()))
                .toList();
        Venta v = ventaService.registrar(principal, permiso,
                new VentaService.VentaInput(req.codigoUnico(), req.tasaBcv(), items, pagos, req.creadoAt(), req.clienteId(),
                        req.servicios(), req.vueltoUsd(), req.vueltoBs()));
        return VentaResponse.de(v);
    }

    @GetMapping("/{id}")
    public VentaResponse ver(@PathVariable Long id) {
        return VentaResponse.de(ventaService.buscar(id));
    }

    /** Texto plano del ticket de 40 columnas, para que el Conector lo imprima. */
    @GetMapping(value = "/{id}/ticket", produces = MediaType.TEXT_PLAIN_VALUE)
    public String ticket(@PathVariable Long id) {
        return ticketService.generar(ventaService.buscar(id));
    }

    /**
     * Ventas de un día (hoy por defecto, zona America/Caracas). Una caja ve las suyas; el
     * dueño/encargado sin caja ve las de todas sus cajas.
     */
    @GetMapping
    public List<VentaLista> delDia(@AuthenticationPrincipal KioskPrincipal principal,
                                   @org.springframework.web.bind.annotation.RequestParam(required = false)
                                   @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
                                   java.time.LocalDate fecha) {
        List<Venta> l = ventaService.ventasDelDia(principal, fecha);
        var dev = devolucionService.devueltoPorVenta(l.stream().map(Venta::getId).toList());
        return l.stream().map(v -> VentaLista.de(v, dev.getOrDefault(v.getId(), BigDecimal.ZERO))).toList();
    }

    /** Historial: buscar una venta por su número de factura (en la caja de la sesión, o en todas si es el dueño). */
    @GetMapping("/buscar")
    public List<VentaLista> buscar(@AuthenticationPrincipal KioskPrincipal principal,
                                   @org.springframework.web.bind.annotation.RequestParam Integer numero) {
        List<Venta> l = ventaService.buscarPorNumero(principal, numero);
        var dev = devolucionService.devueltoPorVenta(l.stream().map(Venta::getId).toList());
        return l.stream().map(v -> VentaLista.de(v, dev.getOrDefault(v.getId(), BigDecimal.ZERO))).toList();
    }

    @GetMapping("/{id}/detalle")
    public com.kioskpos.web.devolucion.DevolucionService.DetalleVentaVista detalle(@PathVariable Long id) {
        return devolucionService.detalle(id);
    }

    @org.springframework.web.bind.annotation.PostMapping("/{id}/anular")
    public VentaResponse anular(@AuthenticationPrincipal KioskPrincipal principal, @PathVariable Long id,
                                @RequestBody AnularRequest req) {
        return VentaResponse.de(devolucionService.anular(principal, id, req.motivo()));
    }

    @org.springframework.web.bind.annotation.PostMapping("/{id}/devolver")
    public com.kioskpos.web.devolucion.DevolucionService.DevolucionHecha devolver(@AuthenticationPrincipal KioskPrincipal principal, @PathVariable Long id,
                                                           @RequestBody com.kioskpos.web.devolucion.DevolucionService.NuevaDevolucion req) {
        return devolucionService.devolver(principal, id, req);
    }

    public record AnularRequest(String motivo) {
    }

    /** Fila de la lista de ventas: con cómo se pagó y lo ya devuelto. */
    public record VentaLista(Long id, Integer numeroFactura, Instant fechaHora, Long cajaId, BigDecimal totalUsd,
                             BigDecimal totalBs, String estado, Long clienteId, String pagos, int items, BigDecimal devueltoUsd,
                             String productos) {
        static VentaLista de(Venta v, BigDecimal devuelto) {
            String pagos = v.getPagos().stream().map(p -> p.getMetodo().name()).distinct()
                    .reduce((a, b) -> a + "," + b).orElse("");
            return new VentaLista(v.getId(), v.getNumeroFactura(), v.getFechaHora(), v.getCajaId(), v.getTotalUsd(),
                    v.getTotalBs(), v.getEstado(), v.getClienteId(), pagos, v.getDetalles().size(), devuelto,
                    v.getDetalles().stream().map(d -> d.getNombre()).reduce((a, b) -> a + ", " + b).orElse(""));
        }
    }

    public record ItemRequest(Long productoId, @NotNull BigDecimal cantidad, BigDecimal precioUsd, String nombre, Long presentacionId) {
    }

    public record PagoRequest(@NotNull MetodoPago metodo, @NotNull Moneda moneda,
                              @NotNull BigDecimal montoOriginal, String referencia) {
    }

    public record RegistrarVentaRequest(String codigoUnico, @NotNull BigDecimal tasaBcv,
                                        List<ItemRequest> items, List<PagoRequest> pagos,
                                        Long creadoAt, Long clienteId, List<VentaService.ServicioInput> servicios,
                                        BigDecimal vueltoUsd, BigDecimal vueltoBs) {
    }

    public record VentaResponse(Long id, Integer numeroFactura, Instant fechaHora,
                                BigDecimal totalUsd, BigDecimal totalBs,
                                BigDecimal vueltoUsd, BigDecimal vueltoBs, String estado) {
        static VentaResponse de(Venta v) {
            return new VentaResponse(v.getId(), v.getNumeroFactura(), v.getFechaHora(),
                    v.getTotalUsd(), v.getTotalBs(), v.getVueltoUsd(), v.getVueltoBs(), v.getEstado());
        }
    }
}
