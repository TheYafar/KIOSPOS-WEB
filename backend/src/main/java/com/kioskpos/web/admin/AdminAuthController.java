package com.kioskpos.web.admin;

import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminAuthController {

    private final SuperAdminService superAdminService;

    public AdminAuthController(SuperAdminService superAdminService) {
        this.superAdminService = superAdminService;
    }

    /** Login del super admin (panel aparte). Pendiente: segundo factor (2FA). */
    @PostMapping("/login")
    public TokenResponse login(@RequestBody LoginRequest req) {
        return new TokenResponse(superAdminService.login(req.email(), req.password()));
    }

    public record LoginRequest(@NotBlank String email, @NotBlank String password) {
    }

    public record TokenResponse(String token) {
    }
}
