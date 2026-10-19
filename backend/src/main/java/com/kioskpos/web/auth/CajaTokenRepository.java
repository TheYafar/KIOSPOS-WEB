package com.kioskpos.web.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Tabla de directorio sin RLS: solo se consulta por token_hash exacto (resolución
 * pre-sesión).
 */
public interface CajaTokenRepository extends JpaRepository<CajaToken, Long> {
    Optional<CajaToken> findByTokenHash(String tokenHash);
}
