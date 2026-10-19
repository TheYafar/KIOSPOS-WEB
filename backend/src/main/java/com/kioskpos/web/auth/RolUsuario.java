package com.kioskpos.web.auth;

/**
 * Roles dentro de un negocio (ver CLAUDE.md §4). SUPER_ADMIN es global (uriel);
 * su panel aparte se construye en el Paso 4.
 */
public enum RolUsuario {
    DUENO,
    ENCARGADO,
    CAJERO,
    SOPORTE,
    SUPER_ADMIN
}
