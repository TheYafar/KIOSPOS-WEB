package com.kioskpos.web.suscripcion;

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
 * Un pago de suscripción. Lo reporta el dueño (PENDIENTE) y lo aprueba el super admin
 * (APROBADO), lo que empuja la fecha "pago_hasta" del negocio. Tabla de facturación:
 * sin RLS (ver V3), los endpoints del dueño filtran por negocio_id en la aplicación.
 */
@Entity
@Table(name = "pagos")
@Getter
@Setter
@NoArgsConstructor
public class Pago {

    public enum Estado { PENDIENTE, APROBADO, RECHAZADO }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto;

    @Column(nullable = false, length = 10)
    private String moneda = "USD";

    @Column(nullable = false, length = 30)
    private String metodo;

    @Column(length = 120)
    private String referencia;

    @Column(nullable = false)
    private int meses = 1;

    @Column(nullable = false, length = 20)
    private String estado = Estado.PENDIENTE.name();

    @Column(name = "reportado_at", insertable = false, updatable = false)
    private Instant reportadoAt;

    @Column(name = "aprobado_at")
    private Instant aprobadoAt;

    @Column(name = "aprobado_por")
    private Long aprobadoPor;
}
