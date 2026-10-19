package com.kioskpos.web.producto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;

/**
 * Nótese que esto NO trae negocio_id: esa es justamente la barrera de aplicación
 * del CLAUDE.md — el negocio_id nunca puede llegar desde el cliente/request.
 */
public record CrearProductoRequest(
        @NotBlank String codigoBarras,
        @NotBlank String nombre,
        @NotNull @Positive BigDecimal precioUsd) {
}
