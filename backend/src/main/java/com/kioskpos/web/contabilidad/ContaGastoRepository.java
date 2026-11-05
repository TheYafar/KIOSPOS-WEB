package com.kioskpos.web.contabilidad;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Gastos del modo automático. Ninguna consulta filtra por negocio_id en Java: RLS lo
 * hace en la base (solo ve el negocio de la sesión).
 */
public interface ContaGastoRepository extends JpaRepository<ContaGasto, Long> {

    List<ContaGasto> findByFechaBetweenOrderByFechaDescIdDesc(LocalDate desde, LocalDate hasta);

    /** Total gastado por categoría en el rango (fechas inclusivas). */
    @Query("SELECT g.categoria, COALESCE(SUM(g.montoUsd), 0) FROM ContaGasto g "
            + "WHERE g.fecha >= :desde AND g.fecha <= :hasta GROUP BY g.categoria")
    List<Object[]> totalPorCategoriaEntre(@Param("desde") LocalDate desde, @Param("hasta") LocalDate hasta);

    /** Total gastado (todas las categorías) en el rango, 0 si no hay. */
    @Query("SELECT COALESCE(SUM(g.montoUsd), 0) FROM ContaGasto g "
            + "WHERE g.fecha >= :desde AND g.fecha <= :hasta")
    BigDecimal totalEntre(@Param("desde") LocalDate desde, @Param("hasta") LocalDate hasta);
}
