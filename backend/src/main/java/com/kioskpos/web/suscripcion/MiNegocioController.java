package com.kioskpos.web.suscripcion;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
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
    private final NegocioRepository negocioRepository;

    public MiNegocioController(SuscripcionService suscripcionService, PagoRepository pagoRepository,
                              NegocioRepository negocioRepository) {
        this.suscripcionService = suscripcionService;
        this.pagoRepository = pagoRepository;
        this.negocioRepository = negocioRepository;
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

    /** Perfil y horarios de cierre. GET lo puede leer cualquier usuario del negocio
     *  (incluido el cajero, para el aviso de cierre en la caja). */
    @GetMapping("/config")
    public ConfigNegocio config(@AuthenticationPrincipal KioskPrincipal principal) {
        Negocio n = negocioRepository.findById(principal.negocioId())
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));
        return new ConfigNegocio(n.getNombre(), n.getTelefono(), n.getDireccion(),
                n.getCajasContratadas(), n.getHorariosCierre());
    }

    /** Actualiza el perfil y horarios (solo dueño/encargado, por SecurityConfig). */
    @PutMapping("/config")
    public ConfigNegocio actualizarConfig(@AuthenticationPrincipal KioskPrincipal principal,
                                          @RequestBody ActualizarConfigRequest req) {
        Negocio n = negocioRepository.findById(principal.negocioId())
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));
        n.setTelefono(req.telefono());
        n.setDireccion(req.direccion());
        n.setHorariosCierre(req.horariosCierre());
        negocioRepository.save(n);
        return new ConfigNegocio(n.getNombre(), n.getTelefono(), n.getDireccion(),
                n.getCajasContratadas(), n.getHorariosCierre());
    }

    public record ConfigNegocio(String nombre, String telefono, String direccion,
                                Integer cajasContratadas, String horariosCierre) {
    }

    public record ActualizarConfigRequest(String telefono, String direccion, String horariosCierre) {
    }
}
