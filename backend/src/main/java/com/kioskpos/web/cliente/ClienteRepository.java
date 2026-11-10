package com.kioskpos.web.cliente;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Clientes del negocio de la sesión (RLS). */
public interface ClienteRepository extends JpaRepository<Cliente, Long> {
    List<Cliente> findAllByOrderByNombreAsc();

    Optional<Cliente> findFirstByCedula(String cedula);

    /** Bloquea la fila del cliente hasta terminar la venta (dos fiados a la vez no pasan el límite). */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("SELECT c FROM Cliente c WHERE c.id = :id")
    Optional<Cliente> bloquear(@org.springframework.data.repository.query.Param("id") Long id);
}
