package com.kioskpos.web.contabilidad;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Un gasto anotado por el dueño para el modo automático (servicios, internet,
 * alquiler, otros). La nómina NO vive aquí: se lee del módulo Nómina para no
 * contarla doble. Fila bajo RLS por negocio_id (V7__contabilidad.sql).
 */
@Entity
@Table(name = "conta_gastos")
@Getter
@Setter
@NoArgsConstructor
public class ContaGasto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(nullable = false)
    private LocalDate fecha;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CategoriaGasto categoria = CategoriaGasto.OTRO;

    @Column(nullable = false, length = 200)
    private String concepto;

    @Column(name = "monto_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal montoUsd = BigDecimal.ZERO;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
