package com.kioskpos.web.cliente;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Clientes del negocio de la sesión (RLS). */
public interface ClienteRepository extends JpaRepository<Cliente, Long> {
    List<Cliente> findAllByOrderByNombreAsc();

    Optional<Cliente> findFirstByCedula(String cedula);
}
