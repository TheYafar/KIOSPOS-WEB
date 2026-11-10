package com.kioskpos.web.devolucion;

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
@Table(name = "devolucion_detalles")
@Getter
@Setter
@NoArgsConstructor
public class DevolucionDetalle {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "devolucion_id", nullable = false)
    private Long devolucionId;

    @Column(name = "detalle_venta_id", nullable = false)
    private Long detalleVentaId;

    @Column(name = "producto_id")
    private Long productoId;

    @Column(nullable = false, precision = 12, scale = 3)
    private BigDecimal cantidad;

    @Column(name = "monto_usd", nullable = false, precision = 14, scale = 2)
    private BigDecimal montoUsd;
}
