package com.kioskpos.web.cuadre;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MovimientoCajaRepository extends JpaRepository<MovimientoCaja, Long> {
    List<MovimientoCaja> findByTurnoIdOrderByIdAsc(Long turnoId);

    List<MovimientoCaja> findByTurnoIdAndAnuladoFalse(Long turnoId);

    List<MovimientoCaja> findByVentaId(Long ventaId);

    /** Del negocio (RLS) en un rango, para los reportes del día. */
    List<MovimientoCaja> findByAnuladoFalseAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(Instant desde, Instant hasta);
}
