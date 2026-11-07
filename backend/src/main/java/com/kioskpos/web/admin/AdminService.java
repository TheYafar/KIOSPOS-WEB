package com.kioskpos.web.admin;

import com.kioskpos.web.auth.Caja;
import com.kioskpos.web.auth.CajaRepository;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.correo.EmailService;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.suscripcion.Pago;
import com.kioskpos.web.suscripcion.PagoRepository;
import com.kioskpos.web.suscripcion.SituacionNegocio;
import com.kioskpos.web.suscripcion.SuscripcionService;
import com.kioskpos.web.tenant.NegocioContext;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Panel de super admin: vista transversal de todos los negocios y acciones sobre su
 * suscripción. negocios/pagos no tienen RLS, así que se consultan directamente; para
 * mirar datos de un negocio que SÍ están bajo RLS (sus cajas) se fija el contexto de
 * ese negocio explícitamente.
 */
@Service
public class AdminService {

    private final NegocioRepository negocioRepository;
    private final PagoRepository pagoRepository;
    private final CajaRepository cajaRepository;
    private final SuscripcionService suscripcionService;
    private final NegocioRegistroService negocioRegistroService;
    private final EmailService emailService;

    public AdminService(NegocioRepository negocioRepository,
                        PagoRepository pagoRepository,
                        CajaRepository cajaRepository,
                        SuscripcionService suscripcionService,
                        NegocioRegistroService negocioRegistroService,
                        EmailService emailService) {
        this.negocioRepository = negocioRepository;
        this.pagoRepository = pagoRepository;
        this.cajaRepository = cajaRepository;
        this.suscripcionService = suscripcionService;
        this.negocioRegistroService = negocioRegistroService;
        this.emailService = emailService;
    }

    public List<NegocioVista> listarNegocios() {
        return negocioRepository.findAll().stream().map(this::vista).toList();
    }

    public NegocioVista verNegocio(Long negocioId) {
        Negocio n = negocioRepository.findById(negocioId)
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));
        return vista(n);
    }

    public NegocioRegistroService.NegocioCreado crearNegocio(
            String nombreNegocio, String nombreDueno, String email, String password,
            String telefono, String direccion, Integer cajasContratadas, String horariosCierre) {
        NegocioRegistroService.NegocioCreado creado =
                negocioRegistroService.registrarNegocioConDueno(nombreNegocio, nombreDueno, email, password);
        // Guarda el perfil del negocio recién creado (negocios no tiene RLS).
        negocioRepository.findById(creado.negocioId()).ifPresent(n -> {
            n.setTelefono(telefono);
            n.setDireccion(direccion);
            if (cajasContratadas != null && cajasContratadas > 0) {
                n.setCajasContratadas(cajasContratadas);
            }
            n.setHorariosCierre(horariosCierre);
            negocioRepository.save(n);
        });
        // Correo de bienvenida (async y a prueba de fallos: no rompe el alta si falla).
        emailService.bienvenida(email, nombreDueno, nombreNegocio);
        return creado;
    }

    public Negocio aprobarPago(Long pagoId, Long superAdminId) {
        return suscripcionService.aprobarPago(pagoId, superAdminId);
    }

    /** El super admin registra un pago ya recibido del dueño (y reactiva si estaba suspendido). */
    public Negocio registrarPago(Long negocioId, java.math.BigDecimal monto, String moneda,
                                 String metodo, String referencia, int meses, Long superAdminId) {
        return suscripcionService.registrarPagoAdmin(negocioId, monto, moneda, metodo, referencia, meses, superAdminId);
    }

    public void suspender(Long negocioId) {
        suscripcionService.suspender(negocioId);
    }

    public void reactivar(Long negocioId) {
        suscripcionService.reactivar(negocioId);
    }

    public List<Pago> pagosPendientes() {
        return pagoRepository.findByEstadoOrderByReportadoAtDesc(Pago.Estado.PENDIENTE.name());
    }

    /** Las cajas de un negocio (datos bajo RLS: se fija su contexto para leerlas). */
    public List<Caja> cajasDeNegocio(Long negocioId) {
        try {
            NegocioContext.set(negocioId);
            return cajaRepository.findAll();
        } finally {
            NegocioContext.clear();
        }
    }

    private NegocioVista vista(Negocio n) {
        SituacionNegocio sit = suscripcionService.situacion(n);
        CajasResumen cajas = resumenCajas(n.getId());
        Pago ultimo = pagoRepository
                .findByNegocioIdAndEstadoOrderByAprobadoAtDesc(n.getId(), Pago.Estado.APROBADO.name())
                .stream().findFirst().orElse(null);
        return new NegocioVista(sit, cajas.cantidad(), cajas.ultimaVezEnLinea(),
                ultimo == null ? null : new UltimoPago(
                        ultimo.getMonto() + " " + ultimo.getMoneda(),
                        ultimo.getReferencia(), ultimo.getAprobadoAt()));
    }

    private CajasResumen resumenCajas(Long negocioId) {
        try {
            NegocioContext.set(negocioId);
            List<Caja> cajas = cajaRepository.findAll();
            Instant ultima = cajas.stream()
                    .map(Caja::getLastSeen)
                    .filter(java.util.Objects::nonNull)
                    .max(Instant::compareTo)
                    .orElse(null);
            return new CajasResumen(cajas.size(), ultima);
        } finally {
            NegocioContext.clear();
        }
    }

    private record CajasResumen(int cantidad, Instant ultimaVezEnLinea) {
    }

    public record UltimoPago(String monto, String referencia, Instant fecha) {
    }

    public record NegocioVista(SituacionNegocio situacion, int cajas,
                               Instant ultimaVezEnLinea, UltimoPago ultimoPago) {
    }
}
