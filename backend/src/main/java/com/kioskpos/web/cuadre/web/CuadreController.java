package com.kioskpos.web.cuadre.web;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cuadre.CuadreService;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Cuadre de caja. Abrir y cerrar turno los hace la caja (JWT con cajaId).
 */
@RestController
@RequestMapping("/api/cuadre")
public class CuadreController {

    private final CuadreService cuadreService;

    public CuadreController(CuadreService cuadreService) {
        this.cuadreService = cuadreService;
    }

    /** Apertura de turno con el fondo (base) de la gaveta. */
    @PostMapping("/abrir")
    public CuadreService.Resumen abrir(@AuthenticationPrincipal KioskPrincipal principal,
                                       @RequestBody AbrirRequest req) {
        exigirCaja(principal);
        var turno = cuadreService.abrir(principal.cajaId(), principal.usuarioId(),
                req.fondoUsd(), req.fondoBs());
        return cuadreService.resumen(turno.getId());
    }

    /** Resumen vivo del turno (lo esperado en gaveta hasta ahora). */
    @GetMapping("/turnos/{id}")
    public CuadreService.Resumen resumen(@PathVariable Long id) {
        return cuadreService.resumen(id);
    }

    /** Cierre simple: se cuenta el efectivo y se compara con lo esperado. */
    @PostMapping("/turnos/{id}/cerrar")
    public CuadreService.Resumen cerrar(@PathVariable Long id, @RequestBody CerrarRequest req) {
        return cuadreService.cerrarSimple(id, req.declaradoUsd(), req.declaradoBs());
    }

    private void exigirCaja(KioskPrincipal principal) {
        if (principal == null || principal.cajaId() == null) {
            throw new IllegalArgumentException("Solo una caja puede abrir o cerrar turno");
        }
    }

    public record AbrirRequest(@NotNull BigDecimal fondoUsd, @NotNull BigDecimal fondoBs) {
    }

    public record CerrarRequest(@NotNull BigDecimal declaradoUsd, @NotNull BigDecimal declaradoBs) {
    }
}
