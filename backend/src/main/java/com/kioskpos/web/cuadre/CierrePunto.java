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

/** Ticket de cierre de lote del punto de venta (o Biopago), copiado por el cajero al cerrar. */
@Entity
@Table(name = "cierres_punto")
@Getter
@Setter
@NoArgsConstructor
public class CierrePunto {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "turno_id")
    private Long turnoId;

    @Column(name = "caja_id")
    private Long cajaId;

    @Column(name = "usuario_id")
    private Long usuarioId;

    /** PUNTO o BIOPAGO. */
    @Column(nullable = false, length = 10)
    private String tipo = "PUNTO";

    /** Lo que sale arriba del ticket: "EPN DIEGO HERNANDEZ CRE". */
    @Column(length = 80)
    private String titular;

    @Column(length = 30)
    private String afiliado;

    @Column(name = "lote_credito", length = 20)
    private String loteCredito;

    @Column(name = "lote_debito", length = 20)
    private String loteDebito;

    @Column(name = "lote_master_visa", length = 20)
    private String loteMasterVisa;

    /** Fecha y hora que trae el ticket del banco. */
    @Column(name = "fecha_hora", nullable = false)
    private Instant fechaHora;

    @Column(name = "cred_compras_n", nullable = false)
    private int credComprasN;

    @Column(name = "cred_compras", nullable = false, precision = 14, scale = 2)
    private BigDecimal credCompras = BigDecimal.ZERO;

    @Column(name = "cred_anul_n", nullable = false)
    private int credAnulN;

    @Column(name = "cred_anul", nullable = false, precision = 14, scale = 2)
    private BigDecimal credAnul = BigDecimal.ZERO;

    @Column(name = "deb_compras_n", nullable = false)
    private int debComprasN;

    @Column(name = "deb_compras", nullable = false, precision = 14, scale = 2)
    private BigDecimal debCompras = BigDecimal.ZERO;

    @Column(name = "deb_anul_n", nullable = false)
    private int debAnulN;

    @Column(name = "deb_anul", nullable = false, precision = 14, scale = 2)
    private BigDecimal debAnul = BigDecimal.ZERO;

    @Column(name = "mv_compras_n", nullable = false)
    private int mvComprasN;

    @Column(name = "mv_compras", nullable = false, precision = 14, scale = 2)
    private BigDecimal mvCompras = BigDecimal.ZERO;

    @Column(name = "mv_anul_n", nullable = false)
    private int mvAnulN;

    @Column(name = "mv_anul", nullable = false, precision = 14, scale = 2)
    private BigDecimal mvAnul = BigDecimal.ZERO;

    /** (compras − anulaciones) de las tres secciones, en Bs. */
    @Column(name = "total_bs", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalBs = BigDecimal.ZERO;

    @Column(length = 300)
    private String nota;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
