package com.kioskpos.web.suscripcion;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.tasa.TasaNegocioService;
import com.kioskpos.web.tasa.TasaService;
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
    private final TasaService tasaService;
    private final TasaNegocioService tasaNegocioService;

    public MiNegocioController(SuscripcionService suscripcionService, PagoRepository pagoRepository,
                              NegocioRepository negocioRepository, TasaService tasaService,
                              TasaNegocioService tasaNegocioService) {
        this.suscripcionService = suscripcionService;
        this.pagoRepository = pagoRepository;
        this.negocioRepository = negocioRepository;
        this.tasaService = tasaService;
        this.tasaNegocioService = tasaNegocioService;
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

    // ---------- Configuración de la caja (formas de pago + tasa) ----------
    // Es del NEGOCIO (todas sus cajas la comparten). La lee cualquier usuario (el cajero
    // la necesita para cobrar); la cambia solo dueño/encargado (SecurityConfig).

    @GetMapping("/caja-config")
    public CajaConfig cajaConfig(@AuthenticationPrincipal KioskPrincipal principal) {
        return aCajaConfig(negocio(principal));
    }

    @PutMapping("/caja-config")
    public CajaConfig actualizarCajaConfig(@AuthenticationPrincipal KioskPrincipal principal,
                                           @RequestBody ActualizarCajaConfig req) {
        Negocio n = negocio(principal);
        String modo = req.tasaModo() == null ? "BCV" : req.tasaModo().trim().toUpperCase();
        if (!List.of("BCV", "AJUSTE", "MANUAL").contains(modo)) {
            throw new IllegalArgumentException("Modo de tasa inválido");
        }
        String tipo = req.ajusteTipo() == null ? "PCT" : req.ajusteTipo().trim().toUpperCase();
        if (!List.of("PCT", "BS").contains(tipo)) {
            throw new IllegalArgumentException("Tipo de aumento inválido");
        }
        BigDecimal ajuste = req.ajuste() == null ? BigDecimal.ZERO : req.ajuste();
        BigDecimal manual = req.tasaManual() == null ? BigDecimal.ZERO : req.tasaManual();
        if (ajuste.signum() < 0 || manual.signum() < 0) {
            throw new IllegalArgumentException("La tasa y el aumento no pueden ser negativos");
        }
        if ("PCT".equals(tipo) && ajuste.compareTo(BigDecimal.valueOf(100)) > 0) {
            throw new IllegalArgumentException("El aumento no puede pasar de 100%");
        }
        if (req.metodosPago() != null && req.metodosPago().length() > 20_000) {
            throw new IllegalArgumentException("Configuración de formas de pago demasiado grande");
        }
        n.setTasaModo(modo);
        n.setTasaAjusteTipo(tipo);
        n.setTasaAjuste(ajuste);
        n.setTasaManual(manual);
        n.setMetodosPago(req.metodosPago());
        negocioRepository.save(n);
        return aCajaConfig(n);
    }

    private Negocio negocio(KioskPrincipal principal) {
        return negocioRepository.findById(principal.negocioId())
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));
    }

    private CajaConfig aCajaConfig(Negocio n) {
        return new CajaConfig(n.getMetodosPago(), n.getTasaModo(), n.getTasaAjusteTipo(), n.getTasaAjuste(),
                n.getTasaManual(), tasaService.bcv(), tasaNegocioService.efectiva(n));
    }

    /** metodosPago: JSON opaco de la PWA (qué formas están activas + monedas extra). */
    public record CajaConfig(String metodosPago, String tasaModo, String ajusteTipo, BigDecimal ajuste,
                             BigDecimal tasaManual, Integer tasaBcv, BigDecimal tasaEfectiva) {
    }

    public record ActualizarCajaConfig(String metodosPago, String tasaModo, String ajusteTipo,
                                       BigDecimal ajuste, BigDecimal tasaManual) {
    }
}
