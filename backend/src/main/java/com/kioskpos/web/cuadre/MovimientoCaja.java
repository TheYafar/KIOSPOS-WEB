package com.kioskpos.web.cuadre;

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
 * Movimiento de efectivo del turno que NO es una venta: gasto, retiro, ingreso o avance
 * de efectivo. Afecta lo esperado en la gaveta al cerrar.
 */
@Entity
@Table(name = "movimientos_caja")
@Getter
@Setter
@NoArgsConstructor
public class MovimientoCaja {

    public enum Tipo {
        /** Se pagó algo con plata de la caja (hielo, bolsas, transporte...). */
        GASTO,
        /** El dueño se lleva efectivo (no es gasto: es retiro de la gaveta). */
        RETIRO,
        /** Se mete efectivo a la gaveta (ej. sencillo para vueltos). */
        INGRESO,
        /** Avance de efectivo: el cliente paga por punto/pago móvil y se le entrega efectivo. */
        AVANCE;

        public boolean saleEfectivo() {
            return this != INGRESO;
        }
    }

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

    @Column(nullable = false, length = 10)
    private String tipo;

    /** USD o VES: moneda del efectivo que sale/entra. */
    @Column(nullable = false, length = 3)
    private String moneda;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto;

    @Column(name = "metodo_cobro", length = 20)
    private String metodoCobro;

    @Column(name = "monto_cobrado", precision = 14, scale = 2)
    private BigDecimal montoCobrado;

    @Column(precision = 14, scale = 2)
    private BigDecimal comision;

    @Column(precision = 14, scale = 4)
    private BigDecimal tasa;

    @Column(nullable = false, length = 200)
    private String concepto;

    @Column(nullable = false)
    private boolean anulado = false;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
