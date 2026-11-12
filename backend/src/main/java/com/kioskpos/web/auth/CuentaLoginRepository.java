package com.kioskpos.web.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Tabla de directorio sin RLS: solo se consulta por email exacto (resolución
 * pre-sesión). No exponer un findAll() ni consultas amplias desde la app.
 */
public interface CuentaLoginRepository extends JpaRepository<CuentaLogin, Long> {
    Optional<CuentaLogin> findByEmail(String email);
    boolean existsByEmail(String email);
    /** La primera cuenta de un negocio es la del dueño (la crea el alta). Solo para el super admin. */
    Optional<CuentaLogin> findFirstByNegocioIdOrderByIdAsc(Long negocioId);
    /** La cuenta de login de un usuario (para editar su correo/clave o desactivarla al borrarlo). */
    Optional<CuentaLogin> findByUsuarioId(Long usuarioId);
}
