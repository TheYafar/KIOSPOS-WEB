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
    private final com.kioskpos.web.recarga.RecargaRepository recargaRepository;

    /** Máximo de días de un reporte por rango (un año). */
    public static final int MAX_DIAS = 366;

    public ReporteService(VentaRepository ventaRepository,
                          DetalleVentaRepository detalleVentaRepository,
                          PagoVentaRepository pagoVentaRepository,
                          TurnoRepository turnoRepository,
                          MovimientoCajaRepository movimientoCajaRepository,
                          MovimientoClienteRepository movimientoClienteRepository,
                          com.kioskpos.web.devolucion.DevolucionRepository devolucionRepository,
                          com.kioskpos.web.recarga.RecargaRepository recargaRepository) {
        this.recargaRepository = recargaRepository;
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
        return resumenEntre(d, d);
    }

    /**
     * Resumen de un rango de días (ambos incluidos, calendario de Venezuela): lo mismo que el
     * del día, más los productos más vendidos y la venta/ganancia de cada día (para semana y mes).
     */
    @Transactional(readOnly = true)
    public ResumenDia resumenEntre(LocalDate desdeDia, LocalDate hastaDia) {
        LocalDate d = desdeDia != null ? desdeDia : LocalDate.now(ZONA);
        LocalDate h = hastaDia != null ? hastaDia : d;
        if (h.isBefore(d)) {
            throw new IllegalArgumentException("La fecha final no puede ser antes de la inicial");
        }
        if (java.time.temporal.ChronoUnit.DAYS.between(d, h) >= MAX_DIAS) {
            throw new IllegalArgumentException("El rango no puede pasar de un año");
        }
        Instant desde = d.atStartOfDay(ZONA).toInstant();
        Instant hasta = h.plusDays(1).atStartOfDay(ZONA).toInstant();

        Object[] tot = ventaRepository.totalesEntre(desde, hasta).get(0);
        BigDecimal totalUsd = dec(tot[0]);
        BigDecimal totalBs = dec(tot[1]);
        long cantidad = ((Number) tot[2]).longValue();

        BigDecimal costo = detalleVentaRepository.costoEntre(desde, hasta);
        if (costo == null) {
            costo = BigDecimal.ZERO;
        }
        // Las devoluciones del día restan lo devuelto y su costo (la mercancía volvió al stock).
        Object[] dev = detalleVentaRepository.devueltoYCostoEntre(
                java.time.LocalDateTime.ofInstant(desde, java.time.ZoneOffset.UTC),
                java.time.LocalDateTime.ofInstant(hasta, java.time.ZoneOffset.UTC)).get(0);
        BigDecimal devueltoUsd = dec(dev[0]);
        BigDecimal costoDevuelto = dec(dev[1]);
        costo = costo.subtract(costoDevuelto).max(BigDecimal.ZERO);
        BigDecimal ganancia = totalUsd.subtract(devueltoUsd).subtract(costo);

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

        // Recargas de saldo (todas las cajas).
        long cantRecargas = 0;
        BigDecimal recargasBs = BigDecimal.ZERO;
        BigDecimal comisionRecargas = BigDecimal.ZERO;
        for (var rc : recargaRepository.findByAnuladaFalseAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(desde, hasta)) {
            cantRecargas++;
            recargasBs = recargasBs.add(rc.getMontoBs());
            comisionRecargas = comisionRecargas.add(rc.getComisionBs());
        }

        List<ProductoTop> top = new ArrayList<>();
        for (Object[] f : detalleVentaRepository.masVendidosEntre(desde, hasta,
                org.springframework.data.domain.PageRequest.of(0, 10))) {
            BigDecimal vendido = dec(f[3]);
            top.add(new ProductoTop(f[0] == null ? null : ((Number) f[0]).longValue(), String.valueOf(f[1]),
                    dec(f[2]), vendido, vendido.subtract(dec(f[4]))));
        }

        // Día por día (solo si el rango tiene más de un día).
        List<DiaLinea> porDia = new ArrayList<>();
        if (h.isAfter(d)) {
            for (LocalDate x = d; !x.isAfter(h); x = x.plusDays(1)) {
                Instant a = x.atStartOfDay(ZONA).toInstant();
                Instant b = x.plusDays(1).atStartOfDay(ZONA).toInstant();
                Object[] t = ventaRepository.totalesEntre(a, b).get(0);
                BigDecimal vend = dec(t[0]);
                BigDecimal cos = detalleVentaRepository.costoEntre(a, b);
                Object[] dv = detalleVentaRepository.devueltoYCostoEntre(
                        java.time.LocalDateTime.ofInstant(a, java.time.ZoneOffset.UTC),
                        java.time.LocalDateTime.ofInstant(b, java.time.ZoneOffset.UTC)).get(0);
                BigDecimal neto = vend.subtract(dec(dv[0]));
                BigDecimal costoNeto = (cos == null ? BigDecimal.ZERO : cos).subtract(dec(dv[1])).max(BigDecimal.ZERO);
                porDia.add(new DiaLinea(x.toString(), ((Number) t[2]).longValue(), neto, neto.subtract(costoNeto)));
            }
        }

        return new ResumenDia(d.toString(), cantidad, totalUsd, totalBs, costo, ganancia, desglose,
                List.copyOf(movs.values()), comision, abonos, devueltoUsd,
                h.toString(), cantRecargas, recargasBs, comisionRecargas, top, porDia);
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
                             BigDecimal devolucionesUsd,
                             String hasta, long cantidadRecargas, BigDecimal recargasBs, BigDecimal comisionRecargasBs,
                             List<ProductoTop> masVendidos, List<DiaLinea> porDia) {
    }

    /** Un producto entre los más vendidos: cantidad, vendido $ y ganancia $. */
    public record ProductoTop(Long productoId, String nombre, BigDecimal cantidad, BigDecimal vendidoUsd, BigDecimal gananciaUsd) {
    }

    /** Venta neta y ganancia de un día dentro de un rango. */
    public record DiaLinea(String fecha, long cantidadVentas, BigDecimal totalUsd, BigDecimal gananciaUsd) {
    }

    /** Gastos/retiros/ingresos/avances del día por moneda. */
    public record MovimientoDia(String tipo, String moneda, BigDecimal total, int cantidad) {
    }

    public record CierreDia(Long turnoId, Long cajaId, Instant fechaCierre,
                            BigDecimal vendidoUsd, BigDecimal gananciaUsd,
                            BigDecimal diferenciaUsd, BigDecimal diferenciaBs) {
    }
}
