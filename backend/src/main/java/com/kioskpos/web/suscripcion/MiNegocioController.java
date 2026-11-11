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
    private final com.kioskpos.web.auth.CajaRepository cajaRepository;

    public MiNegocioController(SuscripcionService suscripcionService, PagoRepository pagoRepository,
                              NegocioRepository negocioRepository, TasaService tasaService,
                              TasaNegocioService tasaNegocioService,
                              com.kioskpos.web.auth.CajaRepository cajaRepository) {
        this.cajaRepository = cajaRepository;
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

    /** El dueño elige plan y cuántas cajas; la nueva mensualidad aplica al próximo pago. */
    @PutMapping("/plan")
    public SituacionNegocio cambiarPlan(@AuthenticationPrincipal KioskPrincipal principal, @RequestBody CambiarPlanRequest req) {
        long activas = cajaRepository.findByActivaTrue().size(); // bajo RLS: solo las de su negocio
        suscripcionService.cambiarPlan(principal.negocioId(), req.plan(), req.cajas() == null ? 1 : req.cajas(), activas);
        return suscripcionService.situacion(principal.negocioId());
    }

    public record CambiarPlanRequest(String plan, Integer cajas) {
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
        return aConfig(n);
    }

    /** Actualiza el perfil y horarios (solo dueño/encargado, por SecurityConfig). */
    @PutMapping("/config")
    public ConfigNegocio actualizarConfig(@AuthenticationPrincipal KioskPrincipal principal,
                                          @RequestBody ActualizarConfigRequest req) {
        Negocio n = negocioRepository.findById(principal.negocioId())
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));
        if (req.nombre() != null) {
            String nombre = req.nombre().trim();
            if (nombre.isEmpty() || nombre.length() > 150) {
                throw new IllegalArgumentException("El nombre del negocio es obligatorio (máx. 150 letras)");
            }
            n.setNombre(nombre);
        }
        n.setTelefono(limpio(req.telefono(), 40));
        n.setDireccion(limpio(req.direccion(), 200));
        n.setHorariosCierre(req.horariosCierre());
        if (req.rif() != null) {
            n.setRif(limpio(req.rif(), 30));
        }
        if (req.mensajeTicket() != null) {
            n.setMensajeTicket(limpio(req.mensajeTicket(), 200));
        }
        negocioRepository.save(n);
        return aConfig(n);
    }

    private static String limpio(String v, int max) {
        if (v == null || v.isBlank()) {
            return null;
        }
        String t = v.trim();
        if (t.length() > max) {
            throw new IllegalArgumentException("Texto demasiado largo (máx. " + max + ")");
        }
        return t;
    }

    private static ConfigNegocio aConfig(Negocio n) {
        return new ConfigNegocio(n.getNombre(), n.getTelefono(), n.getDireccion(),
                n.getCajasContratadas(), n.getHorariosCierre(), n.getRif(), n.getMensajeTicket());
    }

    public record ConfigNegocio(String nombre, String telefono, String direccion,
                                Integer cajasContratadas, String horariosCierre,
                                String rif, String mensajeTicket) {
    }

    public record ActualizarConfigRequest(String telefono, String direccion, String horariosCierre,
                                          String nombre, String rif, String mensajeTicket) {
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
