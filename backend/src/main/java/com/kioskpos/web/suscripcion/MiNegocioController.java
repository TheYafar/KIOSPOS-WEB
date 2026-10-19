package com.kioskpos.web.suscripcion;

import com.kioskpos.web.auth.security.KioskPrincipal;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lo que el dueño ve y hace sobre SU suscripción: estado actual y reportar un pago
 * (que luego el super admin aprueba). Todo opera sobre el negocio de la sesión; nunca
 * recibe negocio_id del request.
 */
@RestController
@RequestMapping("/api/mi-negocio")
public class MiNegocioController {

    private final SuscripcionService suscripcionService;
    private final PagoRepository pagoRepository;

    public MiNegocioController(SuscripcionService suscripcionService, PagoRepository pagoRepository) {
        this.suscripcionService = suscripcionService;
        this.pagoRepository = pagoRepository;
    }

    @GetMapping("/suscripcion")
    public SituacionNegocio suscripcion(@AuthenticationPrincipal KioskPrincipal principal) {
        return suscripcionService.situacion(principal.negocioId());
    }

    @GetMapping("/pagos")
    public List<Pago> misPagos(@AuthenticationPrincipal KioskPrincipal principal) {
        return pagoRepository.findByNegocioIdOrderByReportadoAtDesc(principal.negocioId());
    }

    @PostMapping("/pagos")
    public Pago reportarPago(@AuthenticationPrincipal KioskPrincipal principal,
                             @RequestBody ReportarPagoRequest req) {
        return suscripcionService.reportarPago(principal.negocioId(), req.monto(),
                req.moneda(), req.metodo(), req.referencia(), req.meses() == null ? 1 : req.meses());
    }

    public record ReportarPagoRequest(
            @NotNull @Positive BigDecimal monto,
            String moneda,
            @NotBlank String metodo,
            String referencia,
            Integer meses) {
    }
}
