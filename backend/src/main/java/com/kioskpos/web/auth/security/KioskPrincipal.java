package com.kioskpos.web.auth.security;

import com.kioskpos.web.auth.RolUsuario;

/**
 * Identidad autenticada que viaja en el JwtAuthFilter. cajaId es null para logins de
 * dueño/encargado (correo+contraseña) y está presente en logins de cajero (PIN sobre
 * una caja registrada).
 */
public record KioskPrincipal(Long usuarioId, Long negocioId, RolUsuario rol, Long cajaId) {
}
