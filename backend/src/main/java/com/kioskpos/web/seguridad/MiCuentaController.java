package com.kioskpos.web.seguridad;

import com.kioskpos.web.auth.security.KioskPrincipal;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Seguridad de la cuenta del dueño/encargado: su código de recuperación. */
@RestController
@RequestMapping("/api/mi-cuenta")
public class MiCuentaController {

    private final RecuperacionService recuperacion;

    public MiCuentaController(RecuperacionService recuperacion) {
        this.recuperacion = recuperacion;
    }

    @GetMapping("/recuperacion")
    public Map<String, Boolean> estado(@AuthenticationPrincipal KioskPrincipal p) {
        return Map.of("tiene", recuperacion.tiene(p.usuarioId()));
    }

    /** Genera un código NUEVO (el anterior deja de servir). Se muestra una sola vez. */
    @PostMapping("/recuperacion")
    public Map<String, String> generar(@AuthenticationPrincipal KioskPrincipal p) {
        return Map.of("codigo", recuperacion.generarParaUsuario(p.usuarioId()));
    }
}
