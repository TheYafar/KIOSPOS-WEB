package com.kioskpos.web.venta;

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
}
