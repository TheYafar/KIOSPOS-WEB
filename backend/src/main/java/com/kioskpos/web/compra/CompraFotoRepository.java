package com.kioskpos.web.compra;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompraFotoRepository extends JpaRepository<CompraFoto, Long> {
    List<CompraFoto> findByCompraIdOrderByIdAsc(Long compraId);
    long countByCompraId(Long compraId);
}
