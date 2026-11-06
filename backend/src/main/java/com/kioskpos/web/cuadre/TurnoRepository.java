package com.kioskpos.web.cuadre;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TurnoRepository extends JpaRepository<Turno, Long> {
    Optional<Turno> findFirstByCajaIdAndEstado(Long cajaId, String estado);
    List<Turno> findByEstadoOrderByFechaAperturaDesc(String estado);

    /** Cierres (turnos CERRADOS) cuyo cierre cayó en el rango [desde, hasta). Del negocio por RLS. */
    List<Turno> findByEstadoAndFechaCierreGreaterThanEqualAndFechaCierreLessThanOrderByFechaCierreAsc(
            String estado, Instant desde, Instant hasta);
}
