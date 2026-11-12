package com.kioskpos.web.cuadre;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CierrePuntoRepository extends JpaRepository<CierrePunto, Long> {
    List<CierrePunto> findByTurnoIdOrderByFechaHoraAsc(Long turnoId);

    List<CierrePunto> findByFechaHoraGreaterThanEqualAndFechaHoraLessThanOrderByFechaHoraDesc(Instant desde, Instant hasta);
}
