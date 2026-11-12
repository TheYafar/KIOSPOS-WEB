package com.kioskpos.web.recarga;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecargaRepository extends JpaRepository<Recarga, Long> {
    List<Recarga> findByTurnoIdOrderByIdDesc(Long turnoId);

    List<Recarga> findByTurnoIdAndAnuladaFalse(Long turnoId);

    List<Recarga> findByVentaId(Long ventaId);

    List<Recarga> findByAnuladaFalseAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(Instant desde, Instant hasta);
}
