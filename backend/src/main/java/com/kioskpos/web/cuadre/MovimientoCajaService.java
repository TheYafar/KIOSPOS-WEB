package com.kioskpos.web.cuadre;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gastos, retiros, ingresos y avances de efectivo del turno abierto de la caja.
 * Todos cambian lo que debe haber en la gaveta al cerrar (CuadreService).
 */
@Service
public class MovimientoCajaService {

    private static final Set<String> METODOS_AVANCE = Set.of("PUNTO", "PAGO_MOVIL", "BIOPAGO");

    private final MovimientoCajaRepository repo;
    private final TurnoRepository turnoRepository;
    private final CuadreService cuadreService;

    public MovimientoCajaService(MovimientoCajaRepository repo, TurnoRepository turnoRepository,
                                 CuadreService cuadreService) {
        this.repo = repo;
        this.turnoRepository = turnoRepository;
        this.cuadreService = cuadreService;
    }

    public record Nuevo(MovimientoCaja.Tipo tipo, String moneda, BigDecimal monto, String concepto,
                        String metodoCobro, BigDecimal montoCobrado, BigDecimal tasa) {
    }

    @Transactional
    public MovimientoCaja registrar(KioskPrincipal principal, Nuevo n) {
        if (principal == null || principal.cajaId() == null) {
            throw new IllegalArgumentException("Los movimientos de caja se registran desde una caja");
        }
        Turno turno = turnoRepository.findFirstByCajaIdAndEstado(principal.cajaId(), Turno.Estado.ABIERTO.name())
                .orElseThrow(() -> new IllegalStateException("La caja está cerrada. Ábrela primero."));
        if (n.tipo() == null) {
            throw new IllegalArgumentException("Falta el tipo de movimiento");
        }
        String moneda = "USD".equals(n.moneda()) ? "USD" : "VES".equals(n.moneda()) ? "VES" : null;
        if (moneda == null) {
            throw new IllegalArgumentException("Moneda inválida (USD o VES)");
        }
        BigDecimal monto = n.monto() == null ? BigDecimal.ZERO : n.monto().setScale(2, RoundingMode.HALF_UP);
        if (monto.signum() <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a 0");
        }
        String concepto = n.concepto() == null ? "" : n.concepto().trim();

        MovimientoCaja m = new MovimientoCaja();
        m.setNegocioId(NegocioContext.require());
        m.setTurnoId(turno.getId());
        m.setCajaId(principal.cajaId());
        m.setUsuarioId(principal.usuarioId());
        m.setTipo(n.tipo().name());
        m.setMoneda(moneda);
        m.setMonto(monto);

        if (n.tipo() == MovimientoCaja.Tipo.AVANCE) {
            if (!METODOS_AVANCE.contains(n.metodoCobro())) {
                throw new IllegalArgumentException("¿Cómo pagó el cliente el avance? (punto, pago móvil o biopago)");
            }
            BigDecimal tasa = n.tasa();
            if ("USD".equals(moneda) && (tasa == null || tasa.signum() <= 0)) {
                throw new IllegalArgumentException("Falta la tasa para un avance en dólares");
            }
            BigDecimal entregadoBs = "USD".equals(moneda) ? monto.multiply(tasa).setScale(2, RoundingMode.HALF_UP) : monto;
            BigDecimal cobrado = n.montoCobrado() == null ? BigDecimal.ZERO : n.montoCobrado().setScale(2, RoundingMode.HALF_UP);
            if (cobrado.compareTo(entregadoBs) < 0) {
                throw new IllegalArgumentException("Lo cobrado por el avance no puede ser menor que lo entregado");
            }
            m.setMetodoCobro(n.metodoCobro());
            m.setMontoCobrado(cobrado);
            m.setComision(cobrado.subtract(entregadoBs));
            m.setTasa(tasa);
            m.setConcepto(concepto.isEmpty() ? "Avance de efectivo" : recortar(concepto));
        } else {
            if (concepto.isEmpty()) {
                throw new IllegalArgumentException(n.tipo() == MovimientoCaja.Tipo.INGRESO
                        ? "Escribe de dónde viene el dinero" : "Escribe en qué se usó el dinero");
            }
            m.setConcepto(recortar(concepto));
        }

        // No puede salir más efectivo del que hay en la gaveta según el sistema.
        if (n.tipo().saleEfectivo()) {
            var r = cuadreService.resumen(turno.getId());
            BigDecimal hay = "USD".equals(moneda) ? r.esperadoUsd() : r.esperadoBs();
            if (monto.compareTo(hay) > 0) {
                throw new IllegalArgumentException("No hay suficiente efectivo en " + ("USD".equals(moneda) ? "dólares" : "bolívares")
                        + " en la caja (hay " + hay.toPlainString() + ").");
            }
        }
        return repo.save(m);
    }

    @Transactional(readOnly = true)
    public List<MovimientoCaja> delTurno(Long turnoId) {
        return repo.findByTurnoIdOrderByIdAsc(turnoId);
    }

    /** Anula un movimiento mal cargado (solo mientras su turno siga abierto). */
    @Transactional
    public MovimientoCaja anular(Long id) {
        MovimientoCaja m = repo.findById(id).orElseThrow(() -> new IllegalArgumentException("Movimiento no encontrado"));
        Turno t = turnoRepository.findById(m.getTurnoId()).orElseThrow();
        if (!Turno.Estado.ABIERTO.name().equals(t.getEstado())) {
            throw new IllegalStateException("El turno ya se cerró; no se puede anular");
        }
        m.setAnulado(true);
        return repo.save(m);
    }

    private static String recortar(String s) {
        return s.length() > 200 ? s.substring(0, 200) : s;
    }
}
