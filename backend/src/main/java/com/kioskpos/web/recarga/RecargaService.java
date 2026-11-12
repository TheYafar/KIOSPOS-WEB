package com.kioskpos.web.recarga;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cuadre.Turno;
import com.kioskpos.web.cuadre.TurnoRepository;
import com.kioskpos.web.suscripcion.SuscripcionService;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Recargas de saldo hechas en el turno abierto de la caja. Lo cobrado entra a su forma de
 * pago en el cuadre (efectivo a la gaveta; pago móvil/punto/biopago a su método).
 */
@Service
public class RecargaService {

    public static final Set<String> OPERADORAS = Set.of("MOVISTAR", "DIGITEL", "MOVILNET", "CANTV", "SIMPLE_TV", "INTER", "OTRA");
    private static final Set<String> METODOS = Set.of("EFECTIVO_USD", "EFECTIVO_BS", "PUNTO", "PAGO_MOVIL", "BIOPAGO");

    private final RecargaRepository repo;
    private final TurnoRepository turnoRepository;
    private final SuscripcionService suscripcionService;

    public RecargaService(RecargaRepository repo, TurnoRepository turnoRepository, SuscripcionService suscripcionService) {
        this.repo = repo;
        this.turnoRepository = turnoRepository;
        this.suscripcionService = suscripcionService;
    }

    public record Nueva(String operadora, String numero, BigDecimal montoBs, String metodoCobro,
                        BigDecimal montoCobrado, BigDecimal tasa, String referencia) {
    }

    @Transactional
    public Recarga registrar(KioskPrincipal principal, Nueva n) {
        if (principal == null || principal.cajaId() == null) {
            throw new IllegalArgumentException("Las recargas se registran desde una caja");
        }
        Long negocioId = NegocioContext.require();
        if (!suscripcionService.situacion(negocioId).puedeCobrar()) {
            throw new IllegalStateException("El servicio de KioskPOS está suspendido: no se puede cobrar.");
        }
        Turno turno = turnoRepository.findFirstByCajaIdAndEstado(principal.cajaId(), Turno.Estado.ABIERTO.name())
                .orElseThrow(() -> new IllegalStateException("La caja está cerrada. Ábrela primero."));
        String operadora = n.operadora() == null ? "" : n.operadora().trim().toUpperCase(Locale.ROOT);
        if (!OPERADORAS.contains(operadora)) {
            throw new IllegalArgumentException("Elige la operadora (Movistar, Digitel, Movilnet...)");
        }
        String numero = n.numero() == null ? "" : n.numero().replaceAll("[^0-9A-Za-z-]", "");
        if (numero.length() < 4 || numero.length() > 30) {
            throw new IllegalArgumentException("Escribe el número de teléfono o contrato");
        }
        BigDecimal monto = n.montoBs() == null ? BigDecimal.ZERO : n.montoBs().setScale(2, RoundingMode.HALF_UP);
        if (monto.signum() <= 0) {
            throw new IllegalArgumentException("El monto de la recarga debe ser mayor a 0");
        }
        String metodo = n.metodoCobro() == null ? "" : n.metodoCobro().trim();
        if (!METODOS.contains(metodo)) {
            throw new IllegalArgumentException("¿Cómo pagó el cliente? (efectivo, pago móvil, punto o biopago)");
        }
        BigDecimal tasa = n.tasa() == null ? BigDecimal.ZERO : n.tasa();
        if (tasa.signum() <= 0) {
            throw new IllegalArgumentException("Falta la tasa del día");
        }
        String moneda = "EFECTIVO_USD".equals(metodo) ? "USD" : "VES";
        BigDecimal cobrado = n.montoCobrado() == null ? BigDecimal.ZERO : n.montoCobrado().setScale(2, RoundingMode.HALF_UP);
        BigDecimal cobradoBs = comoBs(moneda, cobrado, tasa);
        BigDecimal comision = comision(monto, moneda, cobrado, tasa);
        if (cobrado.signum() <= 0 || comision.signum() < 0) {
            throw new IllegalArgumentException("Lo cobrado (Bs " + cobradoBs.toPlainString()
                    + ") no puede ser menor que la recarga (Bs " + monto.toPlainString() + ")");
        }
        Recarga r = new Recarga();
        r.setNegocioId(negocioId);
        r.setTurnoId(turno.getId());
        r.setCajaId(principal.cajaId());
        r.setUsuarioId(principal.usuarioId());
        r.setOperadora(operadora);
        r.setNumero(numero);
        r.setMontoBs(monto);
        r.setMetodoCobro(metodo);
        r.setMoneda(moneda);
        r.setMontoCobrado(cobrado);
        r.setTasa(tasa);
        r.setComisionBs(comision);
        String ref = n.referencia() == null ? null : n.referencia().trim();
        r.setReferencia(ref == null || ref.isEmpty() ? null : ref.length() > 60 ? ref.substring(0, 60) : ref);
        return repo.save(r);
    }

    /**
     * Recarga cobrada DENTRO de una venta (junto con los productos). El dinero ya lo cuentan los
     * pagos de la venta: aquí queda el registro (número, operadora, comisión) con metodo VENTA.
     */
    @Transactional
    public Recarga registrarDeVenta(Long negocioId, Long turnoId, Long cajaId, Long usuarioId, Long ventaId,
                                    String operadoraIn, String numeroIn, BigDecimal montoBs, BigDecimal cobradoBs, BigDecimal tasa) {
        String operadora = operadoraIn == null ? "" : operadoraIn.trim().toUpperCase(Locale.ROOT);
        if (!OPERADORAS.contains(operadora)) {
            throw new IllegalArgumentException("Recarga: elige la operadora (Movistar, Digitel, Movilnet...)");
        }
        String numero = numeroIn == null ? "" : numeroIn.replaceAll("[^0-9A-Za-z-]", "");
        if (numero.length() < 4 || numero.length() > 30) {
            throw new IllegalArgumentException("Recarga: escribe el número de teléfono o contrato");
        }
        Recarga r = new Recarga();
        r.setNegocioId(negocioId);
        r.setTurnoId(turnoId);
        r.setCajaId(cajaId);
        r.setUsuarioId(usuarioId);
        r.setVentaId(ventaId);
        r.setOperadora(operadora);
        r.setNumero(numero);
        r.setMontoBs(montoBs);
        r.setMetodoCobro("VENTA");
        r.setMoneda("VES");
        r.setMontoCobrado(cobradoBs);
        r.setTasa(tasa);
        r.setComisionBs(cobradoBs.subtract(montoBs).setScale(2, RoundingMode.HALF_UP));
        return repo.save(r);
    }

    /** Lo que gana la bodega, en Bs: lo cobrado (en Bs) − lo recargado. Hasta 1 Bs de redondeo cuenta como 0. */
    static BigDecimal comision(BigDecimal montoBs, String moneda, BigDecimal cobrado, BigDecimal tasa) {
        BigDecimal dif = comoBs(moneda, cobrado, tasa).subtract(montoBs);
        if (dif.signum() < 0 && "USD".equals(moneda) && dif.abs().compareTo(tasa.divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)) <= 0) {
            return BigDecimal.ZERO; // cobro en $ redondeado al céntimo
        }
        return dif.setScale(2, RoundingMode.HALF_UP);
    }

    static BigDecimal comoBs(String moneda, BigDecimal monto, BigDecimal tasa) {
        return "USD".equals(moneda) ? monto.multiply(tasa).setScale(2, RoundingMode.HALF_UP) : monto;
    }

    @Transactional(readOnly = true)
    public List<Recarga> delTurno(Long turnoId) {
        return repo.findByTurnoIdOrderByIdDesc(turnoId);
    }

    /** Anula una recarga mal cargada: solo mientras su turno siga abierto y desde su misma caja. */
    @Transactional
    public Recarga anular(KioskPrincipal principal, Long id) {
        Recarga r = repo.findById(id).orElseThrow(() -> new IllegalArgumentException("Recarga no encontrada"));
        if (r.getVentaId() != null) {
            throw new IllegalStateException("Esa recarga se cobró en una venta: anula la venta en “Ventas”");
        }
        if (principal == null || principal.cajaId() == null || !principal.cajaId().equals(r.getCajaId())) {
            throw new IllegalStateException("Solo se puede anular desde la caja donde se hizo");
        }
        Turno t = turnoRepository.findById(r.getTurnoId()).orElseThrow();
        if (!Turno.Estado.ABIERTO.name().equals(t.getEstado())) {
            throw new IllegalStateException("El turno ya se cerró; no se puede anular");
        }
        r.setAnulada(true);
        return repo.save(r);
    }
}
