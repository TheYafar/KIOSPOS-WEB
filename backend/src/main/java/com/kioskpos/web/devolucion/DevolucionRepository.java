package com.kioskpos.web.devolucion;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DevolucionRepository extends JpaRepository<Devolucion, Long> {
    List<Devolucion> findByVentaIdOrderByIdAsc(Long ventaId);

    List<Devolucion> findByTurnoId(Long turnoId);

    List<Devolucion> findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(Instant desde, Instant hasta);

    List<Devolucion> findByVentaIdIn(List<Long> ventaIds);
}
