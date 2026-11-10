package com.kioskpos.web.inventario;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoriaRepository extends JpaRepository<Categoria, Long> {
    List<Categoria> findAllByOrderByNombreAsc();

    Optional<Categoria> findFirstByNombreIgnoreCase(String nombre);
}
