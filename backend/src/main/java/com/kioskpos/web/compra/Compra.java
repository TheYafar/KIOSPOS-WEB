package com.kioskpos.web.compra;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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

/** Factura de compra a un proveedor. */
@Entity
@Table(name = "compras")
@Getter
@Setter
@NoArgsConstructor
public class Compra {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "proveedor_id")
    private Long proveedorId;

    @Column(name = "numero_factura", length = 40)
    private String numeroFactura;

    @Column(nullable = false)
    private LocalDate fecha;

    @Column(name = "total_usd", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalUsd;

    @Column(precision = 14, scale = 4)
    private BigDecimal tasa;

    @Column(nullable = false)
    private boolean pagada = true;

    @Column(nullable = false, length = 12)
    private String estado = "REGISTRADA";

    @Column(length = 200)
    private String nota;

    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
