package com.kioskpos.web.producto;

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

/**
 * Caso de prueba del aislamiento multi-tenant: cada fila pertenece a un
 * {@code negocio_id} y la tabla tiene Row Level Security activada
 * (ver V1__negocios_and_rls.sql). Ninguna consulta de este repositorio filtra por
 * negocio_id en Java — ese filtrado lo hace exclusivamente la base de datos.
 */
@Entity
@Table(name = "productos")
@Getter
@Setter
@NoArgsConstructor
public class Producto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "codigo_barras", nullable = false, length = 50)
    private String codigoBarras;

    @Column(nullable = false, length = 150)
    private String nombre;

    @Column(name = "precio_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal precioUsd;

    @Column(name = "stock_actual", nullable = false, precision = 12, scale = 3)
    private BigDecimal stockActual = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean activo = true;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
