package com.kioskpos.web.inventario;

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

/** Un bloque en que se vende un producto: "Caja" trae 20 a $5,00. La unidad suelta es el producto. */
@Entity
@Table(name = "producto_presentaciones")
@Getter
@Setter
@NoArgsConstructor
public class Presentacion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "producto_id", nullable = false)
    private Long productoId;

    @Column(nullable = false, length = 60)
    private String nombre;

    /** Cuántas unidades del producto trae (en su unidad: piezas, kg, L, m). */
    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal cantidad;

    @Column(name = "precio_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal precioUsd;

    @Column(name = "codigo_barras", length = 60)
    private String codigoBarras;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
