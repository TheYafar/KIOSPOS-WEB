package com.kioskpos.web.nomina;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cliente.ClienteService;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Nómina: pagarle a cada trabajador su sueldo y, en el mismo pago, descontarle lo que
 * debe de fiado (abono NOMINA en su cuenta). neto = sueldo + bonos − otros − fiado.
 * No toca ninguna caja: el dueño paga por fuera (efectivo, pago móvil, transferencia...).
 */
@Service
public class NominaService {

    private static final ZoneId ZONA = ZoneId.of("America/Caracas");
    static final Set<String> METODOS_USD = Set.of("EFECTIVO_USD", "ZELLE", "BINANCE");
    static final Set<String> METODOS_BS = Set.of("EFECTIVO_BS", "PAGO_MOVIL", "TRANSFERENCIA");

    private final PagoNominaRepository pagos;
    private final ClienteService clientes;

    public NominaService(PagoNominaRepository pagos, ClienteService clientes) {
        this.pagos = pagos;
        this.clientes = clientes;
    }

    public record TrabajadorNomina(Long id, String nombre, String telefono, boolean activo, BigDecimal sueldoUsd,
                                   BigDecimal debeFiadoUsd, BigDecimal netoSugeridoUsd, Instant ultimoPago,
                                   String ultimoPeriodo, BigDecimal pagadoEsteMesUsd) {
    }

    public record Resumen(List<TrabajadorNomina> trabajadores, BigDecimal totalSueldosUsd, BigDecimal totalFiadoUsd,
                          BigDecimal pagadoEsteMesUsd) {
    }

    public record NuevoPago(Long trabajadorId, String periodo, BigDecimal sueldoUsd, BigDecimal bonosUsd,
                            BigDecimal otrosDescuentosUsd, String conceptoDescuentos, BigDecimal fiadoDescontadoUsd,
                            String metodo, BigDecimal tasa, String referencia, String nota) {
    }

    public record PagoVista(PagoNomina pago, String trabajador) {
    }

    @Transactional(readOnly = true)
    public Resumen resumen() {
        Instant inicioMes = LocalDate.now(ZONA).withDayOfMonth(1).atStartOfDay(ZONA).toInstant();
        Map<Long, PagoNomina> ultimo = new HashMap<>();
        Map<Long, BigDecimal> mes = new HashMap<>();
        for (PagoNomina p : pagos.findTop300ByOrderByCreatedAtDescIdDesc()) {
            if (!"PAGADO".equals(p.getEstado())) {
                continue;
            }
            ultimo.putIfAbsent(p.getTrabajadorId(), p);
            if (!p.getCreatedAt().isBefore(inicioMes)) {
                mes.merge(p.getTrabajadorId(), p.getNetoUsd(), BigDecimal::add);
            }
        }
        List<TrabajadorNomina> ts = clientes.listar(null, "TRABAJADOR").stream().map(c -> {
            BigDecimal sueldo = c.sueldoUsd() == null ? BigDecimal.ZERO : c.sueldoUsd();
            BigDecimal debe = c.saldoUsd().max(BigDecimal.ZERO);
            PagoNomina u = ultimo.get(c.id());
            return new TrabajadorNomina(c.id(), c.nombre(), c.telefono(), c.activo(), sueldo, debe,
                    sueldo.subtract(debe).max(BigDecimal.ZERO), u == null ? null : u.getCreatedAt(),
                    u == null ? null : u.getPeriodo(), mes.getOrDefault(c.id(), BigDecimal.ZERO));
        }).sorted((a, b) -> a.nombre().compareToIgnoreCase(b.nombre())).toList();
        return new Resumen(ts,
                ts.stream().filter(TrabajadorNomina::activo).map(TrabajadorNomina::sueldoUsd).reduce(BigDecimal.ZERO, BigDecimal::add),
                ts.stream().map(TrabajadorNomina::debeFiadoUsd).reduce(BigDecimal.ZERO, BigDecimal::add),
                mes.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    @Transactional
    public PagoVista pagar(KioskPrincipal principal, NuevoPago in) {
        var det = clientes.detalle(in.trabajadorId());
        var t = det.cliente();
        if (!"TRABAJADOR".equals(t.tipo())) {
            throw new IllegalArgumentException(t.nombre() + " no está anotado como trabajador");
        }
        String periodo = in.periodo() == null ? "" : in.periodo().trim();
        if (periodo.isEmpty()) {
            throw new IllegalArgumentException("Escribe el período (ej. 1ra quincena de noviembre)");
        }
        BigDecimal sueldo = dinero(in.sueldoUsd());
        BigDecimal bonos = dinero(in.bonosUsd());
        BigDecimal otros = dinero(in.otrosDescuentosUsd());
        BigDecimal fiado = dinero(in.fiadoDescontadoUsd());
        if (sueldo.signum() < 0 || bonos.signum() < 0 || otros.signum() < 0 || fiado.signum() < 0) {
            throw new IllegalArgumentException("Los montos no pueden ser negativos");
        }
        BigDecimal debe = t.saldoUsd().max(BigDecimal.ZERO);
        if (fiado.compareTo(debe) > 0) {
            throw new IllegalArgumentException(t.nombre() + " debe $" + debe.toPlainString() + " a crédito; no se puede descontar más");
        }
        BigDecimal neto = sueldo.add(bonos).subtract(otros).subtract(fiado);
        if (neto.signum() < 0) {
            throw new IllegalArgumentException("Los descuentos pasan del sueldo: baja lo que se descuenta del crédito");
        }
        String metodo = in.metodo() == null ? "" : in.metodo();
        boolean enBs = METODOS_BS.contains(metodo);
        if (!enBs && !METODOS_USD.contains(metodo)) {
            throw new IllegalArgumentException("¿Cómo le pagas? (efectivo $, efectivo Bs, pago móvil, transferencia, Zelle o Binance)");
        }
        if (enBs && (in.tasa() == null || in.tasa().signum() <= 0)) {
            throw new IllegalArgumentException("Falta la tasa para pagar en bolívares");
        }

        // Lo del fiado se descuenta en su cuenta (abono NOMINA), así la libreta queda al día.
        if (fiado.signum() > 0) {
            clientes.descontarDelSueldo(principal, t.id(), fiado, "Nómina: " + recortar(periodo, 60));
        }
        PagoNomina p = new PagoNomina();
        p.setNegocioId(NegocioContext.require());
        p.setTrabajadorId(t.id());
        p.setPeriodo(recortar(periodo, 60));
        p.setSueldoUsd(sueldo);
        p.setBonosUsd(bonos);
        p.setOtrosDescuentosUsd(otros);
        p.setConceptoDescuentos(recortar(in.conceptoDescuentos(), 120));
        p.setFiadoDescontadoUsd(fiado);
        p.setNetoUsd(neto);
        p.setMetodo(metodo);
        p.setMoneda(enBs ? "VES" : "USD");
        p.setMontoPagado(enBs ? neto.multiply(in.tasa()).setScale(2, RoundingMode.HALF_UP) : neto);
        p.setTasa(enBs ? in.tasa() : null);
        p.setReferencia(recortar(in.referencia(), 100));
        p.setNota(recortar(in.nota(), 200));
        p.setUsuarioId(principal == null ? null : principal.usuarioId());
        return new PagoVista(pagos.save(p), t.nombre());
    }

    /**
     * Anula un pago mal hecho: queda en el historial como ANULADO y lo que se le había
     * descontado de fiado vuelve a su cuenta (cargo). No toca ninguna caja.
     */
    @Transactional
    public PagoVista anular(KioskPrincipal principal, Long pagoId, String motivo) {
        PagoNomina p = pagos.findById(pagoId).orElseThrow(() -> new IllegalArgumentException("Pago no encontrado"));
        if (!"PAGADO".equals(p.getEstado())) {
            throw new IllegalStateException("Ese pago ya está anulado");
        }
        if (motivo == null || motivo.isBlank()) {
            throw new IllegalArgumentException("Escribe por qué se anula");
        }
        if (p.getFiadoDescontadoUsd().signum() > 0) {
            clientes.reponerDeuda(principal, p.getTrabajadorId(), p.getFiadoDescontadoUsd(), "Pago de nómina anulado: " + p.getPeriodo());
        }
        p.setEstado("ANULADO");
        p.setMotivoAnulacion(recortar(motivo, 200));
        String nombre = clientes.detalle(p.getTrabajadorId()).cliente().nombre();
        return new PagoVista(pagos.save(p), nombre);
    }

    @Transactional(readOnly = true)
    public List<PagoVista> historial(Long trabajadorId) {
        Map<Long, String> nombres = new HashMap<>();
        clientes.listar(null, "TRABAJADOR").forEach(c -> nombres.put(c.id(), c.nombre()));
        List<PagoNomina> l = trabajadorId == null ? pagos.findTop300ByOrderByCreatedAtDescIdDesc()
                : pagos.findByTrabajadorIdOrderByCreatedAtDescIdDesc(trabajadorId);
        return l.stream().map(p -> new PagoVista(p, nombres.getOrDefault(p.getTrabajadorId(), "Trabajador"))).toList();
    }

    private static BigDecimal dinero(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v.setScale(2, RoundingMode.HALF_UP);
    }

    private static String recortar(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String x = s.trim();
        return x.length() > max ? x.substring(0, max) : x;
    }
}
