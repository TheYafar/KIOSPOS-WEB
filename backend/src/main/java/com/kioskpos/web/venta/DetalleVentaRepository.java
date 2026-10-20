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
     * Costo total de lo vendido en el rango (COMPLETADAS). Usa el costo ACTUAL del
     * producto; las líneas sin producto (cobro rápido o producto borrado) no suman
     * costo. La ganancia se calcula aparte: total vendido − este costo.
     */
    @Query("SELECT COALESCE(SUM(p.costoUsd * d.cantidad), 0) FROM DetalleVenta d, "
            + "com.kioskpos.web.producto.Producto p "
            + "WHERE p.id = d.productoId AND d.venta.estado = 'COMPLETADA' "
            + "AND d.venta.fechaHora >= :desde AND d.venta.fechaHora < :hasta")
    BigDecimal costoEntre(@Param("desde") Instant desde, @Param("hasta") Instant hasta);
}
