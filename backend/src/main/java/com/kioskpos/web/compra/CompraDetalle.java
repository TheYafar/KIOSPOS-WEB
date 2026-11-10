package com.kioskpos.web.compra;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "compra_detalles")
@Getter
@Setter
@NoArgsConstructor
public class CompraDetalle {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "compra_id", nullable = false)
    private Long compraId;

    @Column(name = "producto_id")
    private Long productoId;

    @Column(nullable = false, length = 200)
    private String nombre;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal cantidad;

    @Column(name = "costo_unitario_usd", nullable = false, precision = 12, scale = 4)
    private BigDecimal costoUnitarioUsd;

    @Column(name = "subtotal_usd", nullable = false, precision = 14, scale = 2)
    private BigDecimal subtotalUsd;
}
