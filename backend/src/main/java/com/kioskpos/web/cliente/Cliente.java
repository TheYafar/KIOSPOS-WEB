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

/** Cliente de la libreta de fiado. */
@Entity
@Table(name = "clientes")
@Getter
@Setter
@NoArgsConstructor
public class Cliente {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(nullable = false, length = 120)
    private String nombre;

    @Column(length = 20)
    private String cedula;

    @Column(length = 30)
    private String telefono;

    /** Cuánto se le puede fiar como máximo (USD). 0 = sin límite. */
    @Column(name = "limite_credito_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal limiteCreditoUsd = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean activo = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
