package com.kioskpos.web.reporte;

import com.kioskpos.web.cliente.MovimientoCliente;
import com.kioskpos.web.cliente.MovimientoClienteRepository;
import com.kioskpos.web.cuadre.MovimientoCaja;
import com.kioskpos.web.cuadre.MovimientoCajaRepository;
import com.kioskpos.web.cuadre.Turno;
import com.kioskpos.web.cuadre.TurnoRepository;
import com.kioskpos.web.venta.DetalleVentaRepository;
import com.kioskpos.web.venta.PagoVentaRepository;
import com.kioskpos.web.venta.Venta;
import com.kioskpos.web.venta.VentaRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reportes del día del negocio de la sesión (bajo RLS, así que suma solo lo de ese
 * negocio y de todas sus cajas): total vendido, ganancia y desglose por método de
 * pago. Es la base del panel básico del dueño.
 */
@Service
public class ReporteService {

    private static final ZoneId ZONA = ZoneId.of("America/Caracas");

    private final VentaRepository ventaRepository;
    private final DetalleVentaRepository detalleVentaRepository;
    private final PagoVentaRepository pagoVentaRepository;
    private final TurnoRepository turnoRepository;
    private final MovimientoCajaRepository movimientoCajaRepository;
    private final MovimientoClienteRepository movimientoClienteRepository;
    private final com.kioskpos.web.devolucion.DevolucionRepository devolucionRepository;

    public ReporteService(VentaRepository ventaRepository,
                          DetalleVentaRepository detalleVentaRepository,
                          PagoVentaRepository pagoVentaRepository,
                          TurnoRepository turnoRepository,
                          MovimientoCajaRepository movimientoCajaRepository,
                          MovimientoClienteRepository movimientoClienteRepository,
                          com.kioskpos.web.devolucion.DevolucionRepository devolucionRepository) {
        this.devolucionRepository = devolucionRepository;
        this.ventaRepository = ventaRepository;
        this.detalleVentaRepository = detalleVentaRepository;
        this.pagoVentaRepository = pagoVentaRepository;
        this.turnoRepository = turnoRepository;
        this.movimientoCajaRepository = movimientoCajaRepository;
        this.movimientoClienteRepository = movimientoClienteRepository;
    }

    @Transactional(readOnly = true)
    public ResumenDia resumenDelDia(LocalDate dia) {
        LocalDate d = dia != null ? dia : LocalDate.now(ZONA);
        Instant desde = d.atStartOfDay(ZONA).toInstant();
        Instant hasta = d.plusDays(1).atStartOfDay(ZONA).toInstant();

        Object[] tot = ventaRepository.totalesEntre(desde, hasta).get(0);
        BigDecimal totalUsd = dec(tot[0]);
        BigDecimal totalBs = dec(tot[1]);
        long cantidad = ((Number) tot[2]).longValue();

        BigDecimal costo = detalleVentaRepository.costoEntre(desde, hasta);
        if (costo == null) {
            costo = BigDecimal.ZERO;
        }
        BigDecimal ganancia = totalUsd.subtract(costo);

        List<DesglosePago> desglose = new ArrayList<>();
        for (Object[] fila : pagoVentaRepository.desgloseEntre(desde, hasta)) {
            desglose.add(new DesglosePago(
                    String.valueOf(fila[0]), String.valueOf(fila[1]), dec(fila[2]), dec(fila[3])));
        }

        // Gastos, retiros, ingresos y avances del día (todas las cajas), y lo que pagaron de fiado.
        java.util.Map<String, MovimientoDia> movs = new java.util.LinkedHashMap<>();
        BigDecimal comision = BigDecimal.ZERO;
        for (MovimientoCaja m : movimientoCajaRepository.findByAnuladoFalseAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(desde, hasta)) {
            movs.merge(m.getTipo() + ":" + m.getMoneda(), new MovimientoDia(m.getTipo(), m.getMoneda(), m.getMonto(), 1),
                    (a, b) -> new MovimientoDia(a.tipo(), a.moneda(), a.total().add(b.total()), a.cantidad() + 1));
            if (m.getComision() != null) {
                comision = comision.add(m.getComision());
            }
        }
        BigDecimal abonos = movimientoClienteRepository.findByTipoAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                MovimientoCliente.Tipo.ABONO.name(), desde, hasta).stream()
                .map(MovimientoCliente::getMontoUsd).reduce(BigDecimal.ZERO, BigDecimal::add);

        // Devoluciones del día: restan de lo vendido (la mercancía volvió al stock).
        BigDecimal devuelto = devolucionRepository.findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(desde, hasta).stream()
                .map(com.kioskpos.web.devolucion.Devolucion::getTotalUsd).reduce(BigDecimal.ZERO, BigDecimal::add);

        return new ResumenDia(d.toString(), cantidad, totalUsd, totalBs, costo, ganancia, desglose,
                List.copyOf(movs.values()), comision, abonos, devuelto);
    }

    /**
     * Los cierres (turnos cerrados) del día, en orden, para que el dueño vea la ganancia
     * cierre por cierre. Reusa la misma ventana de día (zona America/Caracas) y RLS que
     * {@link #resumenDelDia}, así que solo trae lo de su negocio y todas sus cajas.
     */
    @Transactional(readOnly = true)
    public List<CierreDia> cierresDelDia(LocalDate dia) {
        LocalDate d = dia != null ? dia : LocalDate.now(ZONA);
        Instant desde = d.atStartOfDay(ZONA).toInstant();
        Instant hasta = d.plusDays(1).atStartOfDay(ZONA).toInstant();

        List<CierreDia> cierres = new ArrayList<>();
        List<Turno> turnos = turnoRepository
                .findByEstadoAndFechaCierreGreaterThanEqualAndFechaCierreLessThanOrderByFechaCierreAsc(
                        Turno.Estado.CERRADO.name(), desde, hasta);
        for (Turno t : turnos) {
            BigDecimal vendido = BigDecimal.ZERO;
            for (Venta v : ventaRepository.findByTurnoId(t.getId())) {
                if ("COMPLETADA".equals(v.getEstado())) {
                    vendido = vendido.add(v.getTotalUsd());
                }
            }
            BigDecimal costo = detalleVentaRepository.costoDeTurno(t.getId());
            if (costo == null) {
                costo = BigDecimal.ZERO;
            }
            cierres.add(new CierreDia(
                    t.getId(), t.getCajaId(), t.getFechaCierre(),
                    vendido, vendido.subtract(costo),
                    t.getDiferenciaUsd(), t.getDiferenciaBs()));
        }
        return cierres;
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

    public record DesglosePago(String metodo, String moneda, BigDecimal montoOriginal, BigDecimal equivalenteUsd) {
    }

    public record ResumenDia(String fecha, long cantidadVentas, BigDecimal totalUsd, BigDecimal totalBs,
                             BigDecimal costoUsd, BigDecimal gananciaUsd, List<DesglosePago> pagos,
                             List<MovimientoDia> movimientos, BigDecimal comisionAvancesBs, BigDecimal abonosFiadoUsd,
                             BigDecimal devolucionesUsd) {
    }

    /** Gastos/retiros/ingresos/avances del día por moneda. */
    public record MovimientoDia(String tipo, String moneda, BigDecimal total, int cantidad) {
    }

    public record CierreDia(Long turnoId, Long cajaId, Instant fechaCierre,
                            BigDecimal vendidoUsd, BigDecimal gananciaUsd,
                            BigDecimal diferenciaUsd, BigDecimal diferenciaBs) {
    }
}
