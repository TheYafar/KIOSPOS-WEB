package com.kioskpos.web.compra;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompraDetalleRepository extends JpaRepository<CompraDetalle, Long> {
    List<CompraDetalle> findByCompraIdOrderByIdAsc(Long compraId);
}
