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

/** Bitácora de un cambio de stock. cantidad con signo (negativa = salida). */
@Entity
@Table(name = "movimientos_inventario")
@Getter
@Setter
@NoArgsConstructor
public class MovimientoInventario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "producto_id", nullable = false)
    private Long productoId;

    @Column(nullable = false, length = 30)
    private String tipo;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal cantidad;

    @Column(name = "stock_previo", nullable = false, precision = 12, scale = 3)
    private BigDecimal stockPrevio;

    @Column(name = "stock_posterior", nullable = false, precision = 12, scale = 3)
    private BigDecimal stockPosterior;

    @Column(length = 100)
    private String referencia;

    @Column(length = 255)
    private String descripcion;

    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(name = "fecha_hora", insertable = false, updatable = false)
    private Instant fechaHora;
}
