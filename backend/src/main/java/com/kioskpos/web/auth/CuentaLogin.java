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
 * Tabla de DIRECTORIO (sin RLS): credencial de correo+contraseña. Se consulta por
 * email exacto para resolver a qué negocio pertenece el login, antes de que exista
 * sesión. No guarda datos del negocio más allá del negocio_id de enrutamiento.
 */
@Entity
@Table(name = "cuentas_login")
@Getter
@Setter
@NoArgsConstructor
public class CuentaLogin {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    @Column(nullable = false)
    private boolean activo = true;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
