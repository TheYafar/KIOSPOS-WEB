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

/** Una parte del reembolso de una devolución (ej. $1 en efectivo + Bs 900 por pago móvil). */
@Entity
@Table(name = "devolucion_reembolsos")
@Getter
@Setter
@NoArgsConstructor
public class DevolucionReembolso {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "devolucion_id", nullable = false)
    private Long devolucionId;

    @Column(nullable = false, length = 20)
    private String metodo;

    @Column(nullable = false, length = 3)
    private String moneda;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto;

    @Column(length = 100)
    private String referencia;
}
