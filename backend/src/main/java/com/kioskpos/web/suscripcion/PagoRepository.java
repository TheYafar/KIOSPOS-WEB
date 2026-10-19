package com.kioskpos.web.suscripcion;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Tabla de facturación sin RLS: el aislamiento por negocio se hace con el parámetro
 * negocioId en la aplicación. El super admin consulta de forma transversal.
 */
public interface PagoRepository extends JpaRepository<Pago, Long> {
    List<Pago> findByNegocioIdOrderByReportadoAtDesc(Long negocioId);
    List<Pago> findByEstadoOrderByReportadoAtDesc(String estado);
    List<Pago> findByNegocioIdAndEstadoOrderByAprobadoAtDesc(Long negocioId, String estado);
}
