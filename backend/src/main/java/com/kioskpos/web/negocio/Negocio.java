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

    @Column(name = "cajas_contratadas", nullable = false)
    private Integer cajasContratadas = 1;

    /** Horas de cierre de caja "HH:mm" separadas por coma (ej. "15:00,19:00,22:00"). */
    @Column(name = "horarios_cierre", length = 200)
    private String horariosCierre;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
