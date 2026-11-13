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

/** Un abono (pago parcial o total) a una factura de compra. */
@Entity
@Table(name = "compra_abonos")
@Getter
@Setter
@NoArgsConstructor
public class CompraAbono {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "compra_id", nullable = false)
    private Long compraId;

    @Column(nullable = false)
    private LocalDate fecha;

    @Column(name = "monto_usd", nullable = false, precision = 14, scale = 2)
    private BigDecimal montoUsd;

    @Column(length = 16)
    private String metodo;

    @Column(length = 200)
    private String nota;

    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
