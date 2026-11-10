package com.kioskpos.web.nomina;

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

/** Un pago de nómina a un trabajador (con el fiado descontado). */
@Entity
@Table(name = "pagos_nomina")
@Getter
@Setter
@NoArgsConstructor
public class PagoNomina {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "trabajador_id", nullable = false)
    private Long trabajadorId;

    @Column(nullable = false, length = 60)
    private String periodo;

    @Column(name = "sueldo_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal sueldoUsd;

    @Column(name = "bonos_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal bonosUsd = BigDecimal.ZERO;

    @Column(name = "otros_descuentos_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal otrosDescuentosUsd = BigDecimal.ZERO;

    @Column(name = "concepto_descuentos", length = 120)
    private String conceptoDescuentos;

    @Column(name = "fiado_descontado_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal fiadoDescontadoUsd = BigDecimal.ZERO;

    @Column(name = "neto_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal netoUsd;

    @Column(nullable = false, length = 20)
    private String metodo;

    @Column(nullable = false, length = 3)
    private String moneda;

    @Column(name = "monto_pagado", nullable = false, precision = 14, scale = 2)
    private BigDecimal montoPagado;

    @Column(precision = 14, scale = 4)
    private BigDecimal tasa;

    @Column(length = 100)
    private String referencia;

    @Column(length = 200)
    private String nota;

    /** PAGADO o ANULADO (un pago mal hecho se anula y su fiado vuelve a la cuenta). */
    @Column(nullable = false, length = 10)
    private String estado = "PAGADO";

    @Column(name = "motivo_anulacion", length = 200)
    private String motivoAnulacion;

    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
