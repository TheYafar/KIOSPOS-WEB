package com.kioskpos.web.contabilidad;

import com.kioskpos.web.reporte.ReporteService;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contabilidad del negocio de la sesión (bajo RLS). Dos modos totalmente separados
 * (spec 2026-10-31-contabilidad-design.md):
 *
 *  - AUTOMÁTICO: {@link #resumen} calcula entró/salió/queda del período desde datos
 *    reales (ganancia de ventas, pagos de nómina y gastos anotados) y reparte el
 *    sobrante en "mercancía" y "bolsillo" según el % configurado. Compara con el
 *    período anterior del mismo largo.
 *  - MANUAL ("Mi libro"): la app SOLO guarda y suma lo que el dueño escribe; nunca
 *    mete un número calculado (ver {@link #resumenLibro}).
 */
@Service
public class ContabilidadService {

    private final ReporteService reporteService;
    private final ContaGastoRepository gastoRepository;
    private final ContaLibroRepository libroRepository;
    private final ContaConfigRepository configRepository;

    public ContabilidadService(ReporteService reporteService,
                               ContaGastoRepository gastoRepository,
                               ContaLibroRepository libroRepository,
                               ContaConfigRepository configRepository) {
        this.reporteService = reporteService;
        this.gastoRepository = gastoRepository;
        this.libroRepository = libroRepository;
        this.configRepository = configRepository;
    }

    // ===================== MODO AUTOMÁTICO =====================

    @Transactional(readOnly = true)
    public Resumen resumen(LocalDate desde, LocalDate hasta) {
        if (desde == null || hasta == null || hasta.isBefore(desde)) {
            throw new IllegalArgumentException("Rango de fechas inválido");
        }
        BigDecimal pct = repartoPct();
        Periodo actual = calcularPeriodo(desde, hasta);

        // Período inmediatamente anterior, del mismo largo, para comparar.
        long dias = ChronoUnit.DAYS.between(desde, hasta) + 1;
        LocalDate antHasta = desde.minusDays(1);
        LocalDate antDesde = antHasta.minusDays(dias - 1);
        Periodo anterior = calcularPeriodo(antDesde, antHasta);

        Reparto reparto = repartir(actual.queda(), pct);
        return new Resumen(
                desde.toString(), hasta.toString(),
                actual.entro(), actual.nomina(), actual.servicios(), actual.otros(), actual.salio(),
                actual.queda(), pct, reparto.mercancia(), reparto.bolsillo(),
                new Comparacion(anterior.entro(), anterior.salio(), anterior.queda(),
                        money(actual.queda().subtract(anterior.queda())),
                        variacionPct(actual.queda(), anterior.queda())));
    }

    private Periodo calcularPeriodo(LocalDate desde, LocalDate hasta) {
        BigDecimal entro = money(reporteService.gananciaEntre(desde, hasta));

        BigDecimal servicios = BigDecimal.ZERO;
        BigDecimal otros = BigDecimal.ZERO;
        for (Object[] fila : gastoRepository.totalPorCategoriaEntre(desde, hasta)) {
            CategoriaGasto cat = (CategoriaGasto) fila[0];
            BigDecimal monto = dec(fila[1]);
            if (cat == CategoriaGasto.OTRO) {
                otros = otros.add(monto);
            } else {
                servicios = servicios.add(monto);
            }
        }
        BigDecimal nomina = egresoNominaEntre(desde, hasta);
        BigDecimal salio = money(nomina.add(servicios).add(otros));
        BigDecimal queda = money(entro.subtract(salio));
        return new Periodo(entro, money(nomina), money(servicios), money(otros), salio, queda);
    }

    /**
     * Pagos de nómina del rango = "lo que salió en sueldos". COSTURA: el módulo de
     * Nómina aún no tiene backend (V8 pendiente), así que hoy devuelve 0 — nunca se
     * cuenta doble (anti-objetivo del spec). Cuando exista NominaService, esta es la
     * ÚNICA línea que cambia: devolver la suma de sus pagos en [desde, hasta].
     */
    private BigDecimal egresoNominaEntre(LocalDate desde, LocalDate hasta) {
        return BigDecimal.ZERO;
    }

    /** Reparte el sobrante; si no hay sobrante (queda ≤ 0) no reparte: la pérdida es tuya. */
    private Reparto repartir(BigDecimal queda, BigDecimal pct) {
        if (queda.signum() <= 0) {
            return new Reparto(BigDecimal.ZERO, queda);
        }
        BigDecimal mercancia = money(queda.multiply(pct).divide(new BigDecimal("100"), 6, RoundingMode.HALF_UP));
        return new Reparto(mercancia, money(queda.subtract(mercancia)));
    }

    private BigDecimal repartoPct() {
        return configRepository.findById(NegocioContext.require())
                .map(ContaConfig::getRepartoMercanciaPct)
                .orElse(new BigDecimal("40.00"));
    }

    // ===================== GASTOS (modo automático) =====================

    @Transactional(readOnly = true)
    public List<ContaGasto> listarGastos(LocalDate desde, LocalDate hasta) {
        return gastoRepository.findByFechaBetweenOrderByFechaDescIdDesc(desde, hasta);
    }

    @Transactional
    public ContaGasto crearGasto(LocalDate fecha, CategoriaGasto categoria, String concepto,
                                 BigDecimal montoUsd, Long createdBy) {
        ContaGasto g = new ContaGasto();
        g.setNegocioId(NegocioContext.require());
        g.setFecha(fecha != null ? fecha : LocalDate.now());
        g.setCategoria(categoria != null ? categoria : CategoriaGasto.OTRO);
        g.setConcepto(exigir(concepto));
        g.setMontoUsd(noNeg(montoUsd));
        g.setCreatedBy(createdBy);
        return gastoRepository.save(g);
    }

    @Transactional
    public ContaGasto actualizarGasto(Long id, LocalDate fecha, CategoriaGasto categoria,
                                      String concepto, BigDecimal montoUsd) {
        ContaGasto g = gastoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Gasto no encontrado"));
        g.setFecha(fecha != null ? fecha : g.getFecha());
        g.setCategoria(categoria != null ? categoria : g.getCategoria());
        g.setConcepto(exigir(concepto));
        g.setMontoUsd(noNeg(montoUsd));
        return gastoRepository.save(g);
    }

    @Transactional
    public void eliminarGasto(Long id) {
        if (!gastoRepository.existsById(id)) {
            throw new IllegalArgumentException("Gasto no encontrado");
        }
        gastoRepository.deleteById(id);
    }

    // ===================== MI LIBRO (modo manual) =====================

    @Transactional(readOnly = true)
    public ResumenLibro resumenLibro(LocalDate desde, LocalDate hasta) {
        List<ContaLibroLinea> lineas = libroRepository.findByFechaBetweenOrderByFechaDescIdDesc(desde, hasta);
        BigDecimal ingresos = money(libroRepository.sumaPorTipoEntre(TipoLinea.INGRESO, desde, hasta));
        BigDecimal egresos = money(libroRepository.sumaPorTipoEntre(TipoLinea.EGRESO, desde, hasta));
        return new ResumenLibro(lineas, ingresos, egresos, money(ingresos.subtract(egresos)));
    }

    @Transactional
    public ContaLibroLinea crearLinea(LocalDate fecha, String concepto, TipoLinea tipo,
                                      BigDecimal montoUsd, Long createdBy) {
        if (tipo == null) {
            throw new IllegalArgumentException("El tipo (INGRESO/EGRESO) es obligatorio");
        }
        ContaLibroLinea l = new ContaLibroLinea();
        l.setNegocioId(NegocioContext.require());
        l.setFecha(fecha != null ? fecha : LocalDate.now());
        l.setConcepto(exigir(concepto));
        l.setTipo(tipo);
        l.setMontoUsd(noNeg(montoUsd));
        l.setCreatedBy(createdBy);
        return libroRepository.save(l);
    }

    @Transactional
    public ContaLibroLinea actualizarLinea(Long id, LocalDate fecha, String concepto,
                                           TipoLinea tipo, BigDecimal montoUsd) {
        ContaLibroLinea l = libroRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Línea no encontrada"));
        l.setFecha(fecha != null ? fecha : l.getFecha());
        l.setConcepto(exigir(concepto));
        l.setTipo(tipo != null ? tipo : l.getTipo());
        l.setMontoUsd(noNeg(montoUsd));
        return libroRepository.save(l);
    }

    @Transactional
    public void eliminarLinea(Long id) {
        if (!libroRepository.existsById(id)) {
            throw new IllegalArgumentException("Línea no encontrada");
        }
        libroRepository.deleteById(id);
    }

    // ===================== CONFIG =====================

    @Transactional(readOnly = true)
    public BigDecimal getRepartoPct() {
        return repartoPct();
    }

    @Transactional
    public BigDecimal setRepartoPct(BigDecimal pct) {
        if (pct == null || pct.signum() < 0 || pct.compareTo(new BigDecimal("100")) > 0) {
            throw new IllegalArgumentException("El porcentaje debe estar entre 0 y 100");
        }
        ContaConfig cfg = configRepository.findById(NegocioContext.require()).orElseGet(() -> {
            ContaConfig c = new ContaConfig();
            c.setNegocioId(NegocioContext.require());
            return c;
        });
        cfg.setRepartoMercanciaPct(pct.setScale(2, RoundingMode.HALF_UP));
        return configRepository.save(cfg).getRepartoMercanciaPct();
    }

    // ===================== helpers =====================

    private static BigDecimal money(BigDecimal v) {
        return (v != null ? v : BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal noNeg(BigDecimal v) {
        BigDecimal m = money(v);
        return m.signum() < 0 ? BigDecimal.ZERO.setScale(2) : m;
    }

    private static String exigir(String s) {
        if (s == null || s.isBlank()) {
            throw new IllegalArgumentException("El concepto es obligatorio");
        }
        return s.trim();
    }

    /** % de cambio de queda vs el período anterior; null si el anterior era 0 (no hay base). */
    private static BigDecimal variacionPct(BigDecimal actual, BigDecimal anterior) {
        if (anterior == null || anterior.signum() == 0) {
            return null;
        }
        return actual.subtract(anterior)
                .multiply(new BigDecimal("100"))
                .divide(anterior.abs(), 1, RoundingMode.HALF_UP);
    }

    private static BigDecimal dec(Object o) {
        if (o == null) {
            return BigDecimal.ZERO;
        }
        if (o instanceof BigDecimal b) {
            return b;
        }
        return new BigDecimal(o.toString());
    }

    // ===================== DTOs =====================

    private record Periodo(BigDecimal entro, BigDecimal nomina, BigDecimal servicios,
                           BigDecimal otros, BigDecimal salio, BigDecimal queda) {
    }

    private record Reparto(BigDecimal mercancia, BigDecimal bolsillo) {
    }

    public record Comparacion(BigDecimal entroAnterior, BigDecimal salioAnterior, BigDecimal quedaAnterior,
                              BigDecimal diferenciaQueda, BigDecimal variacionPct) {
    }

    public record Resumen(String desde, String hasta,
                          BigDecimal entro, BigDecimal nomina, BigDecimal servicios, BigDecimal otros,
                          BigDecimal salio, BigDecimal queda, BigDecimal repartoMercanciaPct,
                          BigDecimal mercancia, BigDecimal bolsillo, Comparacion anterior) {
    }

    public record ResumenLibro(List<ContaLibroLinea> lineas, BigDecimal ingresos,
                               BigDecimal egresos, BigDecimal saldo) {
    }
}
