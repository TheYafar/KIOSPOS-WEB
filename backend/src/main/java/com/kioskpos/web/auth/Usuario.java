package com.kioskpos.web.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * El "quién" dentro de un negocio. Está bajo Row Level Security por negocio_id.
 * La credencial de correo+contraseña (de dueños/encargados) NO vive aquí, vive en
 * {@link CuentaLogin}; aquí solo el PIN del cajero (hasheado).
 */
@Entity
@Table(name = "usuarios")
@Getter
@Setter
@NoArgsConstructor
public class Usuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "nombre_completo", nullable = false, length = 150)
    private String nombreCompleto;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RolUsuario rol;

    @Column(name = "pin_hash", length = 255)
    private String pinHash;

    @Column(nullable = false)
    private boolean activo = true;

    @Column(name = "es_soporte", nullable = false)
    private boolean esSoporte = false;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
