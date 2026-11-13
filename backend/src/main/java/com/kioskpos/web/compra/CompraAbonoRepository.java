package com.kioskpos.web.compra;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompraAbonoRepository extends JpaRepository<CompraAbono, Long> {
    List<CompraAbono> findByCompraIdOrderByIdDesc(Long compraId);
}
