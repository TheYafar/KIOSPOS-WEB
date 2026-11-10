package com.kioskpos.web.cliente;

import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MovimientoClienteRepository extends JpaRepository<MovimientoCliente, Long> {

    List<MovimientoCliente> findByClienteIdOrderByCreatedAtDescIdDesc(Long clienteId);

    List<MovimientoCliente> findByTurnoIdAndTipo(Long turnoId, String tipo);

    List<MovimientoCliente> findByTipoAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(String tipo, Instant desde, Instant hasta);

    /** Saldo (cargos − abonos) de un cliente, en USD. */
    @Query("""
            SELECT COALESCE(SUM(CASE WHEN m.tipo = 'CARGO' THEN m.montoUsd ELSE -m.montoUsd END), 0)
            FROM MovimientoCliente m WHERE m.clienteId = :clienteId
            """)
    Object saldo(@Param("clienteId") Long clienteId);

    /** Saldo y fecha del último movimiento de cada cliente del negocio (RLS). */
    @Query("""
            SELECT m.clienteId, COALESCE(SUM(CASE WHEN m.tipo = 'CARGO' THEN m.montoUsd ELSE -m.montoUsd END), 0), MAX(m.createdAt)
            FROM MovimientoCliente m GROUP BY m.clienteId
            """)
    List<Object[]> saldos();
}
