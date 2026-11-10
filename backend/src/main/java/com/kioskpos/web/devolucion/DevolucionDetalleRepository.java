package com.kioskpos.web.devolucion;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DevolucionDetalleRepository extends JpaRepository<DevolucionDetalle, Long> {
    List<DevolucionDetalle> findByDevolucionIdIn(List<Long> devolucionIds);
}
