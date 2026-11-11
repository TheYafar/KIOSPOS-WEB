package com.kioskpos.web.suscripcion;

import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Suscripción del negocio: calcula su situación contra el reloj del SERVIDOR y aplica
 * la escalera de corte (CLAUDE.md §3):
 *   - al día              -> ACTIVA, cobra.
 *   - 1..diasGracia vencido-> AVISO, aún cobra.
 *   - > diasGracia vencido -> SUSPENDIDA efectiva, solo consulta (no cobra).
 *   - override manual del super admin (estado = SUSPENDIDA) -> SUSPENDIDA siempre.
 *
 * Como la expiración se evalúa contra el reloj del servidor y el permiso de la caja
 * es un lease corto, adelantar la hora del PC o quedarse offline no evade el corte.
 */
@Service
public class SuscripcionService {

    private static final String SUSPENDIDA = "SUSPENDIDA";
    private static final String ACTIVA = "ACTIVA";
    private static final String AVISO = "AVISO";

    private final NegocioRepository negocioRepository;
    private final PagoRepository pagoRepository;
    private final int diasGracia;

    public SuscripcionService(NegocioRepository negocioRepository,
                              PagoRepository pagoRepository,
                              @Value("${kioskpos.suscripcion.dias-gracia:15}") int diasGracia) {
        this.negocioRepository = negocioRepository;
        this.pagoRepository = pagoRepository;
        this.diasGracia = diasGracia;
    }

    public SituacionNegocio situacion(Negocio n) {
        LocalDate hoy = com.kioskpos.web.Fechas.hoy();
        PlanCatalogo.Plan plan = PlanCatalogo.plan(n.getPlan());
        int cajas = n.getCajasContratadas() == null ? 1 : n.getCajasContratadas();
        BigDecimal precio = plan.mensualidad(cajas);
        boolean prueba = n.isEnPrueba();

        if (SUSPENDIDA.equalsIgnoreCase(n.getEstado())) {
            int meses = mesesPendientes(n.getPagoHasta(), hoy);
            return sit(n, plan, cajas, precio, SUSPENDIDA, false, diasVencido(n.getPagoHasta(), hoy),
                    meses, precio.multiply(BigDecimal.valueOf(meses)), "Suspendida por el administrador");
        }

        int dias = diasVencido(n.getPagoHasta(), hoy);
        int meses = mesesPendientes(n.getPagoHasta(), hoy);
        BigDecimal deuda = precio.multiply(BigDecimal.valueOf(meses));

        if (dias == 0) {
            if (prueba) {
                long quedan = n.getPagoHasta() == null ? 0 : ChronoUnit.DAYS.between(hoy, n.getPagoHasta()) + 1;
                return sit(n, plan, cajas, precio, ACTIVA, true, 0, 0, BigDecimal.ZERO,
                        "Prueba gratis: te quedan " + quedan + (quedan == 1 ? " día" : " días"));
            }
            return sit(n, plan, cajas, precio, ACTIVA, true, 0, 0, BigDecimal.ZERO, "Al día");
        }
        // La prueba gratis vence sola: sin días de gracia.
        if (prueba) {
            return sit(n, plan, cajas, precio, SUSPENDIDA, false, dias, 1, precio,
                    "Tu prueba gratis terminó. Paga tu primer mes para seguir vendiendo.");
        }
        if (dias <= diasGracia) {
            return sit(n, plan, cajas, precio, AVISO, true, dias, meses, deuda,
                    "Pago vencido hace " + dias + " día(s) — regularice para no perder el servicio");
        }
        return sit(n, plan, cajas, precio, SUSPENDIDA, false, dias, meses, deuda,
                "Suspendida por falta de pago (" + dias + " días) — solo consulta");
    }

    private static SituacionNegocio sit(Negocio n, PlanCatalogo.Plan plan, int cajas, BigDecimal mensualidad,
                                        String estado, boolean cobra, int dias, int meses, BigDecimal deuda, String msg) {
        return new SituacionNegocio(n.getId(), n.getNombre(), plan.codigo(), estado, cobra, !cobra,
                n.getPagoHasta(), dias, meses, deuda, msg, n.isEnPrueba(), cajas, mensualidad, plan.nombre());
    }

    /**
     * Cambia el plan y el número de cajas. No deja contratar menos cajas de las que ya
     * están activas (hay que desactivar alguna antes). La nueva mensualidad aplica al
     * próximo pago.
     */
    @Transactional
    public Negocio cambiarPlan(Long negocioId, String plan, int cajas, long cajasActivas) {
        Negocio n = negocioRepository.findById(negocioId)
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));
        String codigo = PlanCatalogo.validar(plan, cajas);
        if (cajas < cajasActivas) {
            throw new IllegalStateException("Tienes " + cajasActivas + " cajas activas. Desactiva alguna antes de bajar a " + cajas + ".");
        }
        n.setPlan(codigo);
        n.setCajasContratadas(cajas);
        return negocioRepository.save(n);
    }

    @Transactional(readOnly = true)
    public SituacionNegocio situacion(Long negocioId) {
        Negocio n = negocioRepository.findById(negocioId)
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));
        return situacion(n);
    }

    public boolean puedeCobrar(Long negocioId) {
        return situacion(negocioId).puedeCobrar();
    }

    /** El dueño reporta un pago manual (queda PENDIENTE hasta que el super admin lo apruebe). */
    @Transactional
    public Pago reportarPago(Long negocioId, BigDecimal monto, String moneda,
                             String metodo, String referencia, int meses) {
        if (monto == null || monto.signum() <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor que cero");
        }
        if (metodo == null || metodo.isBlank()) {
            throw new IllegalArgumentException("El método de pago es obligatorio");
        }
        Pago pago = new Pago();
        pago.setNegocioId(negocioId);
        pago.setMonto(monto);
        pago.setMoneda(moneda == null || moneda.isBlank() ? "USD" : moneda);
        pago.setMetodo(metodo);
        pago.setReferencia(referencia);
        pago.setMeses(Math.max(1, meses));
        pago.setEstado(Pago.Estado.PENDIENTE.name());
        return pagoRepository.save(pago);
    }

    /**
     * El super admin registra un pago YA RECIBIDO (ej. pago móvil que le hizo el dueño):
     * crea el pago, lo aprueba (empuja pago_hasta) y reactiva el negocio si estaba
     * suspendido. Equivale a "reportar + aprobar + reactivar" en un solo paso.
     */
    @Transactional
    public Negocio registrarPagoAdmin(Long negocioId, BigDecimal monto, String moneda,
                                      String metodo, String referencia, int meses, Long superAdminId) {
        Pago pago = reportarPago(negocioId, monto, moneda, metodo, referencia, meses);
        Negocio negocio = aprobarPago(pago.getId(), superAdminId);
        // Registrar un pago reactiva un negocio suspendido (el dueño ya pagó).
        if (SUSPENDIDA.equalsIgnoreCase(negocio.getEstado())) {
            negocio.setEstado(ACTIVA);
            negocioRepository.save(negocio);
        }
        return negocio;
    }

    /** El super admin aprueba un pago: lo marca APROBADO y empuja pago_hasta del negocio. */
    @Transactional
    public Negocio aprobarPago(Long pagoId, Long superAdminId) {
        Pago pago = pagoRepository.findById(pagoId)
                .orElseThrow(() -> new IllegalArgumentException("Pago no encontrado"));
        if (!Pago.Estado.PENDIENTE.name().equals(pago.getEstado())) {
            throw new IllegalStateException("El pago ya fue procesado");
        }
        Negocio negocio = negocioRepository.findById(pago.getNegocioId())
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));

        LocalDate base = negocio.getPagoHasta() != null && negocio.getPagoHasta().isAfter(com.kioskpos.web.Fechas.hoy())
                ? negocio.getPagoHasta()
                : com.kioskpos.web.Fechas.hoy();
        negocio.setPagoHasta(base.plusMonths(pago.getMeses()));
        // Con el primer pago deja de estar en prueba (ya tiene días de gracia como cliente).
        negocio.setEnPrueba(false);
        // Aprobar un pago reactiva un corte automático; no toca una suspensión manual
        // explícita (eso se levanta con reactivar()).
        negocioRepository.save(negocio);

        pago.setEstado(Pago.Estado.APROBADO.name());
        pago.setAprobadoAt(Instant.now());
        pago.setAprobadoPor(superAdminId);
        pagoRepository.save(pago);
        return negocio;
    }

    @Transactional
    public void suspender(Long negocioId) {
        Negocio n = negocioRepository.findById(negocioId)
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));
        n.setEstado(SUSPENDIDA);
        negocioRepository.save(n);
    }

    @Transactional
    public void reactivar(Long negocioId) {
        Negocio n = negocioRepository.findById(negocioId)
                .orElseThrow(() -> new IllegalArgumentException("Negocio no encontrado"));
        n.setEstado(ACTIVA);
        negocioRepository.save(n);
    }

    private int diasVencido(LocalDate pagoHasta, LocalDate hoy) {
        if (pagoHasta == null) {
            return Integer.MAX_VALUE; // nunca pagó -> fuera de gracia
        }
        if (!hoy.isAfter(pagoHasta)) {
            return 0;
        }
        return (int) Math.min(Integer.MAX_VALUE, ChronoUnit.DAYS.between(pagoHasta, hoy));
    }

    private int mesesPendientes(LocalDate pagoHasta, LocalDate hoy) {
        if (pagoHasta == null) {
            return 1;
        }
        int dias = diasVencido(pagoHasta, hoy);
        return dias == 0 ? 0 : (int) Math.ceil(dias / 30.0);
    }
}
