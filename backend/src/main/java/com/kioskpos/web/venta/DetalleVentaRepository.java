package com.kioskpos.web.venta;

import java.math.BigDecimal;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DetalleVentaRepository extends JpaRepository<DetalleVenta, Long> {

    /**
     * Desenlaza un producto de las líneas de venta donde aparece (deja producto_id en
     * null) antes de borrarlo "para siempre". El historial no cambia en dinero: cada
     * línea ya guarda el nombre y el subtotal. RLS mantiene esto dentro del negocio.
     */
    @Modifying
    @Query("UPDATE DetalleVenta d SET d.productoId = null WHERE d.productoId = :productoId")
    int desenlazarProducto(@Param("productoId") Long productoId);

    /**
     * Costo total de lo vendido en el rango (COMPLETADAS). Usa el costo guardado en la
     * línea al vender (histórico); si la línea es vieja y no lo tiene, el costo actual del
     * producto. El cobro rápido sin producto no suma costo. La ganancia se calcula aparte: total vendido − este costo.
     */
    @Query("SELECT COALESCE(SUM(COALESCE(d.costoUnitarioUsd, p.costoUsd, 0) * d.cantidad), 0) FROM DetalleVenta d "
            + "LEFT JOIN com.kioskpos.web.producto.Producto p ON p.id = d.productoId "
            + "WHERE d.venta.estado = 'COMPLETADA' "
            + "AND d.venta.fechaHora >= :desde AND d.venta.fechaHora < :hasta")
    BigDecimal costoEntre(@Param("desde") Instant desde, @Param("hasta") Instant hasta);

    /** Costo de lo vendido en un turno (CERRADO o no). Mismo criterio que {@link #costoEntre}. */
    @Query("SELECT COALESCE(SUM(COALESCE(d.costoUnitarioUsd, p.costoUsd, 0) * d.cantidad), 0) FROM DetalleVenta d "
            + "LEFT JOIN com.kioskpos.web.producto.Producto p ON p.id = d.productoId "
            + "WHERE d.venta.estado = 'COMPLETADA' "
            + "AND d.venta.turnoId = :turnoId")
    BigDecimal costoDeTurno(@Param("turnoId") Long turnoId);

    /** [total devuelto $, costo de lo devuelto $] de las devoluciones del rango (para corregir la ganancia). */
    @Query(value = """
            SELECT COALESCE(SUM(dd.monto_usd), 0),
                   COALESCE(SUM(dd.cantidad * COALESCE(d.costo_unitario_usd, p.costo_usd, 0)), 0)
            FROM devolucion_detalles dd
            JOIN devoluciones dv ON dv.id = dd.devolucion_id
            JOIN detalle_ventas d ON d.id = dd.detalle_venta_id
            LEFT JOIN productos p ON p.id = d.producto_id
            WHERE dv.created_at >= :desde AND dv.created_at < :hasta
            """, nativeQuery = true)
    java.util.List<Object[]> devueltoYCostoEntre(@Param("desde") java.time.LocalDateTime desde, @Param("hasta") java.time.LocalDateTime hasta);

    /**
     * Productos más vendidos del rango (COMPLETADAS): [productoId, nombre, cantidad, vendido $, costo $],
     * ordenados por lo vendido en dólares.
     */
    @Query("SELECT d.productoId, d.nombre, SUM(d.cantidad), SUM(d.subtotalUsd), "
            + "SUM(COALESCE(d.costoUnitarioUsd, p.costoUsd, 0) * d.cantidad) FROM DetalleVenta d "
            + "LEFT JOIN com.kioskpos.web.producto.Producto p ON p.id = d.productoId "
            + "WHERE d.venta.estado = 'COMPLETADA' "
            + "AND d.venta.fechaHora >= :desde AND d.venta.fechaHora < :hasta "
            + "GROUP BY d.productoId, d.nombre ORDER BY SUM(d.subtotalUsd) DESC")
    java.util.List<Object[]> masVendidosEntre(@Param("desde") Instant desde, @Param("hasta") Instant hasta,
                                              org.springframework.data.domain.Pageable pagina);
}
