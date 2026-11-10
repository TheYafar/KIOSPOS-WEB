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

    public VentaController(VentaService ventaService, TicketService ticketService) {
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
        List<VentaService.ItemInput> items = req.items().stream()
                .map(i -> new VentaService.ItemInput(i.productoId(), i.cantidad(), i.precioUsd(), i.nombre()))
                .toList();
        List<VentaService.PagoInput> pagos = req.pagos().stream()
                .map(p -> new VentaService.PagoInput(p.metodo(), p.moneda(), p.montoOriginal(), p.referencia()))
                .toList();
        Venta v = ventaService.registrar(principal, permiso,
                new VentaService.VentaInput(req.codigoUnico(), req.tasaBcv(), items, pagos, req.creadoAt()));
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

    @GetMapping
    public List<VentaResponse> delDia(@AuthenticationPrincipal KioskPrincipal principal) {
        return ventaService.ventasDeCaja(principal.cajaId()).stream().map(VentaResponse::de).toList();
    }

    public record ItemRequest(Long productoId, @NotNull BigDecimal cantidad, BigDecimal precioUsd, String nombre) {
    }

    public record PagoRequest(@NotNull MetodoPago metodo, @NotNull Moneda moneda,
                              @NotNull BigDecimal montoOriginal, String referencia) {
    }

    public record RegistrarVentaRequest(String codigoUnico, @NotNull BigDecimal tasaBcv,
                                        List<ItemRequest> items, List<PagoRequest> pagos,
                                        Long creadoAt) {
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
