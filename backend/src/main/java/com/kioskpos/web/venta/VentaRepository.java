package com.kioskpos.web.venta;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VentaRepository extends JpaRepository<Venta, Long> {

    Optional<Venta> findByCodigoUnico(String codigoUnico);

    List<Venta> findByCajaIdOrderByFechaHoraDesc(Long cajaId);

    List<Venta> findByTurnoId(Long turnoId);

    List<Venta> findByNumeroFacturaOrderByFechaHoraDesc(Integer numeroFactura);

    List<Venta> findByFechaHoraBetweenOrderByFechaHoraDesc(Instant desde, Instant hasta);

    /** Mayor número de factura de una caja (correlativo por caja). 0 si no tiene ventas. */
    @Query("SELECT COALESCE(MAX(v.numeroFactura), 0) FROM Venta v WHERE v.cajaId = :cajaId")
    int maxNumeroFacturaDeCaja(@Param("cajaId") Long cajaId);

    /** [total_usd, total_bs, cantidad] de las ventas COMPLETADAS del rango (del negocio, por RLS). */
    @Query("SELECT COALESCE(SUM(v.totalUsd), 0), COALESCE(SUM(v.totalBs), 0), COUNT(v) "
            + "FROM Venta v WHERE v.estado = 'COMPLETADA' AND v.fechaHora >= :desde AND v.fechaHora < :hasta")
    List<Object[]> totalesEntre(@Param("desde") Instant desde, @Param("hasta") Instant hasta);
}
