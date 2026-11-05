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
 * Una línea del libro MANUAL. Todo lo escribe el dueño; la app nunca aporta ni deriva
 * un número aquí (requisito duro del spec). Fila bajo RLS por negocio_id.
 */
@Entity
@Table(name = "conta_libro")
@Getter
@Setter
@NoArgsConstructor
public class ContaLibroLinea {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(nullable = false)
    private LocalDate fecha;

    @Column(nullable = false, length = 200)
    private String concepto;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private TipoLinea tipo;

    @Column(name = "monto_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal montoUsd = BigDecimal.ZERO;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
