package com.kioskpos.web.reporte;

import com.kioskpos.web.venta.DetalleVentaRepository;
import com.kioskpos.web.venta.PagoVentaRepository;
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

    public ReporteService(VentaRepository ventaRepository,
                          DetalleVentaRepository detalleVentaRepository,
                          PagoVentaRepository pagoVentaRepository) {
        this.ventaRepository = ventaRepository;
        this.detalleVentaRepository = detalleVentaRepository;
        this.pagoVentaRepository = pagoVentaRepository;
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

        return new ResumenDia(d.toString(), cantidad, totalUsd, totalBs, costo, ganancia, desglose);
    }

    /**
     * Ganancia de ventas en un rango de fechas INCLUSIVO (desde y hasta cuentan),
     * en zona America/Caracas: total vendido − costo de lo vendido. La usa el módulo
     * de Contabilidad como "lo que entró" del período. Reusa las mismas consultas por
     * rango que el resumen del día.
     */
    @Transactional(readOnly = true)
    public BigDecimal gananciaEntre(LocalDate desde, LocalDate hasta) {
        Instant i0 = desde.atStartOfDay(ZONA).toInstant();
        Instant i1 = hasta.plusDays(1).atStartOfDay(ZONA).toInstant();

        Object[] tot = ventaRepository.totalesEntre(i0, i1).get(0);
        BigDecimal totalUsd = dec(tot[0]);

        BigDecimal costo = detalleVentaRepository.costoEntre(i0, i1);
        if (costo == null) {
            costo = BigDecimal.ZERO;
        }
        return totalUsd.subtract(costo);
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
                             BigDecimal costoUsd, BigDecimal gananciaUsd, List<DesglosePago> pagos) {
    }
}
