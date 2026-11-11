package com.kioskpos.web.inventario;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PresentacionRepository extends JpaRepository<Presentacion, Long> {
    List<Presentacion> findAllByOrderByProductoIdAscCantidadAsc();

    List<Presentacion> findByProductoIdOrderByCantidadAsc(Long productoId);

    void deleteByProductoId(Long productoId);
}
