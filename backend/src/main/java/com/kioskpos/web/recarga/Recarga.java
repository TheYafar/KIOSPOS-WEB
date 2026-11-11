package com.kioskpos.web.recarga;

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
 * Recarga de saldo vendida en la caja. El cliente paga {@link #montoCobrado} (en su
 * moneda y forma de pago) y la bodega le recarga {@link #montoBs} desde su saldo con la
 * operadora. {@link #comisionBs} = lo que gana la bodega.
 */
@Entity
@Table(name = "recargas")
@Getter
@Setter
@NoArgsConstructor
public class Recarga {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "turno_id", nullable = false)
    private Long turnoId;

    @Column(name = "caja_id", nullable = false)
    private Long cajaId;

    @Column(name = "usuario_id")
    private Long usuarioId;

    @Column(nullable = false, length = 20)
    private String operadora;

    @Column(nullable = false, length = 30)
    private String numero;

    @Column(name = "monto_bs", nullable = false, precision = 14, scale = 2)
    private BigDecimal montoBs;

    @Column(name = "metodo_cobro", nullable = false, length = 20)
    private String metodoCobro;

    @Column(nullable = false, length = 3)
    private String moneda;

    @Column(name = "monto_cobrado", nullable = false, precision = 14, scale = 2)
    private BigDecimal montoCobrado;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal tasa;

    @Column(name = "comision_bs", nullable = false, precision = 14, scale = 2)
    private BigDecimal comisionBs = BigDecimal.ZERO;

    @Column(length = 60)
    private String referencia;

    @Column(nullable = false)
    private boolean anulada;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
