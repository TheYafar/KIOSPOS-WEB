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

/** Una sesión de caja: se abre con un fondo, acumula ventas y se cierra contando. */
@Entity
@Table(name = "turnos")
@Getter
@Setter
@NoArgsConstructor
public class Turno {

    public enum Estado { ABIERTO, CERRADO }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "caja_id", nullable = false)
    private Long cajaId;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(name = "fecha_apertura", nullable = false)
    private Instant fechaApertura = Instant.now();

    @Column(name = "fecha_cierre")
    private Instant fechaCierre;

    @Column(name = "fondo_inicial_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal fondoInicialUsd = BigDecimal.ZERO;

    @Column(name = "fondo_inicial_bs", nullable = false, precision = 14, scale = 2)
    private BigDecimal fondoInicialBs = BigDecimal.ZERO;

    @Column(nullable = false, length = 20)
    private String estado = Estado.ABIERTO.name();

    @Column(name = "declarado_usd", precision = 12, scale = 2)
    private BigDecimal declaradoUsd;

    @Column(name = "declarado_bs", precision = 14, scale = 2)
    private BigDecimal declaradoBs;

    @Column(name = "diferencia_usd", precision = 12, scale = 2)
    private BigDecimal diferenciaUsd;

    @Column(name = "diferencia_bs", precision = 14, scale = 2)
    private BigDecimal diferenciaBs;

    /** Arqueo por forma de pago (JSON en texto) que mandó la caja al cerrar. */
    @Column(name = "arqueo_detalle", columnDefinition = "TEXT")
    private String arqueoDetalle;

    @Column(length = 500)
    private String observaciones;
}
