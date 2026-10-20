package com.kioskpos.web.venta;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PagoVentaRepository extends JpaRepository<PagoVenta, Long> {

    /** [metodo, moneda, suma montoOriginal, suma equivalenteUsd] por método, en el rango. */
    @Query("SELECT p.metodo, p.moneda, COALESCE(SUM(p.montoOriginal), 0), COALESCE(SUM(p.equivalenteUsd), 0) "
            + "FROM PagoVenta p WHERE p.venta.estado = 'COMPLETADA' "
            + "AND p.venta.fechaHora >= :desde AND p.venta.fechaHora < :hasta "
            + "GROUP BY p.metodo, p.moneda")
    List<Object[]> desgloseEntre(@Param("desde") Instant desde, @Param("hasta") Instant hasta);
}
