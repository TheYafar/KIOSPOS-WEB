package com.kioskpos.web.producto;

import java.math.BigDecimal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductoRepository extends JpaRepository<Producto, Long> {

    /**
     * Descuenta stock de forma ATÓMICA y condicional (WHERE stock_actual >= cantidad),
     * devolviendo cuántas filas cambió. Evita que dos ventas simultáneas del mismo
     * producto (dos cajas) lean el mismo stock y vendan de más: solo una toma el stock;
     * la otra recibe 0 filas y falla limpio. RLS sigue aplicando (el UPDATE solo
     * alcanza productos del negocio de la sesión). Portado del VentaService del escritorio.
     */
    @Modifying
    @Query("UPDATE Producto p SET p.stockActual = p.stockActual - :cantidad "
            + "WHERE p.id = :id AND p.stockActual >= :cantidad")
    int descontarStock(@Param("id") Long id, @Param("cantidad") BigDecimal cantidad);
}
