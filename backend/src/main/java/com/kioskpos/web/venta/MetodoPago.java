package com.kioskpos.web.venta;

/** Métodos de pago soportados en P1 (CLAUDE.md §6). */
public enum MetodoPago {
    EFECTIVO_USD,
    EFECTIVO_BS,
    PUNTO,
    PAGO_MOVIL,
    BIOPAGO,
    /** Forma de pago o moneda extra configurada por el negocio (nombre en la referencia). */
    OTRO
}
