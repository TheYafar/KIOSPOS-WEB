package com.kioskpos.web.auth;

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
 * Un equipo/navegador registrado de un negocio. Bajo Row Level Security. El secreto
 * de la caja no vive aquí, sino hasheado en {@link CajaToken}.
 */
@Entity
@Table(name = "cajas")
@Getter
@Setter
@NoArgsConstructor
public class Caja {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "local_id", nullable = false)
    private Long localId;

    @Column(nullable = false, length = 100)
    private String nombre;

    @Column(nullable = false)
    private boolean autorizada = true;

    @Column(nullable = false)
    private boolean activa = true;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_seen")
    private Instant lastSeen;
}
