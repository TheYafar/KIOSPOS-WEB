package com.kioskpos.web.negocio;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * El "tenant": una bodega cliente. No tiene Row Level Security propia (la gestiona
 * el super admin), pero es la referencia de la que cuelgan los datos aislados por
 * negocio_id, como {@link com.kioskpos.web.producto.Producto}.
 */
@Entity
@Table(name = "negocios")
@Getter
@Setter
@NoArgsConstructor
public class Negocio {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 150)
    private String nombre;

    /**
     * Override manual del super admin: "SUSPENDIDA" = cortado a mano, "ACTIVA" =
     * normal. El estado "AVISO" y la escalera de corte se calculan desde
     * {@link #pagoHasta}, no se guardan aquí.
     */
    @Column(nullable = false, length = 20)
    private String estado = "ACTIVA";

    @Column(nullable = false, length = 30)
    private String plan = "BASICO";

    /** Fecha hasta la que está pagada la suscripción (null = nunca ha pagado). */
    @Column(name = "pago_hasta")
    private LocalDate pagoHasta;

    // --- Perfil / configuración del negocio ---

    @Column(length = 40)
    private String telefono;

    @Column(length = 200)
    private String direccion;

    /** RIF que sale en el ticket (opcional). */
    @Column(length = 30)
    private String rif;

    /** Mensaje al pie del ticket (ej. "Gracias por su compra"). Null = el de siempre. */
    @Column(name = "mensaje_ticket", length = 200)
    private String mensajeTicket;

    /** Semana gratis: al vencer se suspende sin días de gracia. El primer pago aprobado lo apaga. */
    @Column(name = "en_prueba", nullable = false)
    private boolean enPrueba;

    @Column(name = "cajas_contratadas", nullable = false)
    private Integer cajasContratadas = 1;

    /** Horas de cierre de caja "HH:mm" separadas por coma (ej. "15:00,19:00,22:00"). */
    @Column(name = "horarios_cierre", length = 200)
    private String horariosCierre;

    /** Formas de pago activas + monedas extra, en JSON (lo define el frontend). */
    @Column(name = "metodos_pago", columnDefinition = "TEXT")
    private String metodosPago;

    /** Cómo se calcula la tasa con la que se cobra: BCV, AJUSTE (BCV + aumento) o MANUAL. */
    @Column(name = "tasa_modo", nullable = false, length = 10)
    private String tasaModo = "BCV";

    @Column(name = "tasa_ajuste_tipo", nullable = false, length = 5)
    private String tasaAjusteTipo = "PCT";

    @Column(name = "tasa_ajuste", nullable = false, precision = 10, scale = 2)
    private java.math.BigDecimal tasaAjuste = java.math.BigDecimal.ZERO;

    @Column(name = "tasa_manual", nullable = false, precision = 14, scale = 2)
    private java.math.BigDecimal tasaManual = java.math.BigDecimal.ZERO;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
