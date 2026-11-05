package com.kioskpos.web.contabilidad;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Líneas del libro manual. RLS por negocio. La suma de ingresos/egresos se calcula en
 * la base pero SOLO sobre líneas que escribió el dueño: no se mezcla ningún dato del
 * sistema (ventas, nómina, gastos) — eso es el modo automático, aparte.
 */
public interface ContaLibroRepository extends JpaRepository<ContaLibroLinea, Long> {

    List<ContaLibroLinea> findByFechaBetweenOrderByFechaDescIdDesc(LocalDate desde, LocalDate hasta);

    /** Suma de las líneas de un tipo (INGRESO/EGRESO) en el rango, 0 si no hay. */
    @Query("SELECT COALESCE(SUM(l.montoUsd), 0) FROM ContaLibroLinea l "
            + "WHERE l.tipo = :tipo AND l.fecha >= :desde AND l.fecha <= :hasta")
    BigDecimal sumaPorTipoEntre(@Param("tipo") TipoLinea tipo,
                                @Param("desde") LocalDate desde, @Param("hasta") LocalDate hasta);
}
