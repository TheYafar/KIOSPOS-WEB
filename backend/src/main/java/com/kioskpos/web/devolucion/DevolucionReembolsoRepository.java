package com.kioskpos.web.devolucion;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DevolucionReembolsoRepository extends JpaRepository<DevolucionReembolso, Long> {
    List<DevolucionReembolso> findByDevolucionIdIn(List<Long> devolucionIds);
}
