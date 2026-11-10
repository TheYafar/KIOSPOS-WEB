package com.kioskpos.web.devolucion;

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

/** Devolución (parcial o total) de una venta. */
@Entity
@Table(name = "devoluciones")
@Getter
@Setter
@NoArgsConstructor
public class Devolucion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "venta_id", nullable = false)
    private Long ventaId;

    @Column(name = "turno_id")
    private Long turnoId;

    @Column(name = "caja_id")
    private Long cajaId;

    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(name = "total_usd", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalUsd;

    @Column(name = "metodo_reembolso", nullable = false, length = 20)
    private String metodoReembolso;

    @Column(name = "monto_reembolso", nullable = false, precision = 14, scale = 2)
    private BigDecimal montoReembolso;

    @Column(precision = 14, scale = 4)
    private BigDecimal tasa;

    @Column(length = 200)
    private String motivo;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
