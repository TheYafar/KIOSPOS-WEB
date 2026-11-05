package com.kioskpos.web.contabilidad;

/**
 * Categorías de los gastos que el dueño anota en el modo automático. En el desglose
 * del tablero, SERVICIOS/INTERNET/ALQUILER se agrupan como "servicios" y OTRO como
 * "otros" (ver {@link ContabilidadService}). Lista corta y editable (CLAUDE.md: a
 * criterio del constructor).
 */
public enum CategoriaGasto {
    SERVICIOS,
    INTERNET,
    ALQUILER,
    OTRO
}
