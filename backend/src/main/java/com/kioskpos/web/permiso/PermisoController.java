package com.kioskpos.web.permiso;

import com.kioskpos.web.auth.security.KioskPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
@RequestMapping("/api/permiso")
public class PermisoController {

    private final PermisoService permisoService;

    public PermisoController(PermisoService permisoService) {
        this.permisoService = permisoService;
    }

    /**
     * La caja renueva su permiso de cobro. Requiere una sesión de caja (el JWT trae
     * cajaId): un dueño sin caja no cobra, así que no renueva permisos.
     */
    @PostMapping("/renovar")
    public PermisoService.PermisoEmitido renovar(@AuthenticationPrincipal KioskPrincipal principal) {
        if (principal == null || principal.cajaId() == null) {
            throw new PermisoDenegadoException("Solo una caja puede pedir permiso de cobro");
        }
        return permisoService.renovar(principal.negocioId(), principal.cajaId());
    }

    @ExceptionHandler(PermisoDenegadoException.class)
    public ResponseEntity<Map<String, String>> denegado(PermisoDenegadoException e) {
        // 403: autenticado, pero el negocio no está al día -> modo solo consulta.
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", e.getMessage(), "modo", "solo_consulta"));
    }
}
