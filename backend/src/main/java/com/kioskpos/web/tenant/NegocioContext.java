package com.kioskpos.web.tenant;

/**
 * Barrera de aplicación del aislamiento multi-tenant: el negocio_id de la petición
 * actual, fijado siempre desde la sesión autenticada (nunca desde el request/DTO).
 * Lo lee {@link TenantAwareJpaTransactionManager} al abrir cada transacción para
 * activar la barrera de base de datos (Row Level Security).
 */
public final class NegocioContext {

    private static final ThreadLocal<Long> CURRENT = new ThreadLocal<>();

    private NegocioContext() {
    }

    public static void set(Long negocioId) {
        CURRENT.set(negocioId);
    }

    public static Long get() {
        return CURRENT.get();
    }

    /**
     * Como {@link #get()}, pero falla rápido si nadie fijó el negocio todavía
     * (p. ej. un endpoint que se olvidó de leerlo de la sesión).
     */
    public static Long require() {
        Long negocioId = CURRENT.get();
        if (negocioId == null) {
            throw new IllegalStateException("No hay negocio_id en el contexto de la sesión actual");
        }
        return negocioId;
    }

    public static void clear() {
        CURRENT.remove();
    }
}
