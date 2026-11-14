package com.kioskpos.web.negocio;

import org.springframework.data.jpa.repository.JpaRepository;

public interface NegocioRepository extends JpaRepository<Negocio, Long> {
    /** Cuántas demos se crearon desde un momento (tope diario de "Probar la demo"). */
    long countByEsDemoTrueAndCreatedAtAfter(java.time.Instant desde);

}
