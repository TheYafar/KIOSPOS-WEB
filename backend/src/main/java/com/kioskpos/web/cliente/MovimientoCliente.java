package com.kioskpos.web.cliente;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Cuenta del cliente: CARGO (se llevó fiado) o ABONO (pagó). Montos en USD. */
@Entity
@Table(name = "movimientos_cliente")
@Getter
@Setter
@NoArgsConstructor
public class MovimientoCliente {

    public enum Tipo { CARGO, ABONO }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "cliente_id", nullable = false)
    private Long clienteId;

    @Column(nullable = false, length = 6)
    private String tipo;

    @Column(name = "monto_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal montoUsd;

    @Column(name = "venta_id")
    private Long ventaId;

    @Column(name = "turno_id")
    private Long turnoId;

    @Column(name = "caja_id")
    private Long cajaId;

    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(length = 20)
    private String metodo;

    @Column(length = 3)
    private String moneda;

    @Column(name = "monto_original", precision = 14, scale = 2)
    private BigDecimal montoOriginal;

    @Column(precision = 14, scale = 4)
    private BigDecimal tasa;

    @Column(length = 100)
    private String referencia;

    @Column(length = 200)
    private String nota;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
