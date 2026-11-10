package com.kioskpos.web.compra;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompraRepository extends JpaRepository<Compra, Long> {
    List<Compra> findTop200ByOrderByFechaDescIdDesc();

    List<Compra> findByProveedorIdOrderByFechaDescIdDesc(Long proveedorId);

    List<Compra> findByEstadoAndPagadaFalse(String estado);
}
