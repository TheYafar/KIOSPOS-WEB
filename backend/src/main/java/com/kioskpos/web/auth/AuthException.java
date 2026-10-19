package com.kioskpos.web.auth;

/** Falla de autenticación: credenciales inválidas, cuenta inactiva, caja no autorizada. */
public class AuthException extends RuntimeException {
    public AuthException(String mensaje) {
        super(mensaje);
    }
}
