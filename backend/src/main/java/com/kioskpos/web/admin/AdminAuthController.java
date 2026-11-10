package com.kioskpos.web.admin;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.seguridad.RecuperarClaveService;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminAuthController {

    private final SuperAdminService superAdminService;
    private final RecuperarClaveService recuperarClaveService;

    public AdminAuthController(SuperAdminService superAdminService, RecuperarClaveService recuperarClaveService) {
        this.superAdminService = superAdminService;
        this.recuperarClaveService = recuperarClaveService;
    }

    /** Login del super admin (panel aparte). Con 2FA activa exige también el código. */
    @PostMapping("/login")
    public TokenResponse login(@RequestBody LoginRequest req) {
        return new TokenResponse(superAdminService.login(req.email(), req.password(), req.codigo()));
    }

    public record LoginRequest(@NotBlank String email, @NotBlank String password, String codigo) {
    }

    // ---- Verificación en dos pasos (solo super admin: /api/admin/** lo exige SecurityConfig) ----

    @GetMapping("/2fa")
    public SuperAdminService.Estado2fa estado2fa(@AuthenticationPrincipal KioskPrincipal p) {
        return superAdminService.estado2fa(p.usuarioId());
    }

    @PostMapping("/2fa/iniciar")
    public SuperAdminService.Inicio2fa iniciar2fa(@AuthenticationPrincipal KioskPrincipal p) {
        return superAdminService.iniciar2fa(p.usuarioId());
    }

    @PostMapping("/2fa/activar")
    public SuperAdminService.Estado2fa activar2fa(@AuthenticationPrincipal KioskPrincipal p, @RequestBody CodigoRequest req) {
        return superAdminService.activar2fa(p.usuarioId(), req.codigo());
    }

    @PostMapping("/2fa/desactivar")
    public SuperAdminService.Estado2fa desactivar2fa(@AuthenticationPrincipal KioskPrincipal p, @RequestBody CodigoRequest req) {
        return superAdminService.desactivar2fa(p.usuarioId(), req.codigo());
    }

    public record CodigoRequest(String codigo) {
    }

    /** Enlace para que el dueño de un negocio ponga contraseña nueva (vence en 24 h). */
    @PostMapping("/negocios/{id}/enlace-clave")
    public Map<String, String> enlaceClave(@PathVariable Long id) {
        return Map.of("enlace", recuperarClaveService.enlaceParaDueno(id));
    }

    public record TokenResponse(String token) {
    }
}
