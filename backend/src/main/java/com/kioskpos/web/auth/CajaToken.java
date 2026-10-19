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
 * Tabla de DIRECTORIO (sin RLS): el hash del secreto que guarda el navegador de una
 * caja. Se consulta por token_hash exacto para resolver el negocio antes de la
 * sesión. El token en claro nunca se guarda en el servidor.
 */
@Entity
@Table(name = "caja_tokens")
@Getter
@Setter
@NoArgsConstructor
public class CajaToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;

    @Column(name = "caja_id", nullable = false)
    private Long cajaId;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "created_at", insertable = false, updatable = false)
    private Instant createdAt;
}
