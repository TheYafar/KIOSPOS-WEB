package com.kioskpos.web.cuadre;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TurnoRepository extends JpaRepository<Turno, Long> {
    Optional<Turno> findFirstByCajaIdAndEstado(Long cajaId, String estado);
    List<Turno> findByEstadoOrderByFechaAperturaDesc(String estado);
}
