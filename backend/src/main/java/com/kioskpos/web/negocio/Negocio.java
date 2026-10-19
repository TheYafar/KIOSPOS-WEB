package com.kioskpos.web.negocio;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
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

    @Column(nullable = false, length = 20)
    private String estado = "ACTIVA";

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
