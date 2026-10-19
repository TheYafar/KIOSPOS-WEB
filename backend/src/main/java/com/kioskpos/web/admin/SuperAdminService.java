package com.kioskpos.web.admin;

import com.kioskpos.web.auth.AuthException;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.security.JwtService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Login del super admin (global, sin negocio). El token resultante no lleva neg claim,
 * así que el filtro no fija ningún NegocioContext: el super admin opera de forma
 * transversal (las tablas de facturación no tienen RLS y para mirar datos de un
 * negocio concreto se fija el contexto explícitamente, ver AdminService).
 *
 * Pendiente: verificación en dos pasos (2FA).
 */
@Service
public class SuperAdminService {

    private final SuperAdminRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public SuperAdminService(SuperAdminRepository repository,
                             PasswordEncoder passwordEncoder,
                             JwtService jwtService) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    public String login(String email, String password) {
        String correo = email == null ? "" : email.trim().toLowerCase();
        SuperAdmin sa = repository.findByEmail(correo).orElse(null);
        boolean ok = sa != null
                && sa.isActivo()
                && passwordEncoder.matches(password == null ? "" : password, sa.getPasswordHash());
        if (!ok) {
            throw new AuthException("Correo o contraseña incorrectos");
        }
        KioskPrincipal p = new KioskPrincipal(sa.getId(), null, RolUsuario.SUPER_ADMIN, null);
        return jwtService.emitir(p);
    }

    @Transactional
    public SuperAdmin crear(String email, String password, String nombre) {
        String correo = email == null ? "" : email.trim().toLowerCase();
        if (correo.isBlank() || password == null || password.length() < 8) {
            throw new IllegalArgumentException("Correo y contraseña (mínimo 8) obligatorios");
        }
        if (repository.findByEmail(correo).isPresent()) {
            throw new IllegalArgumentException("Ya existe un super admin con ese correo");
        }
        SuperAdmin sa = new SuperAdmin();
        sa.setEmail(correo);
        sa.setPasswordHash(passwordEncoder.encode(password));
        sa.setNombre(nombre == null || nombre.isBlank() ? "Super Admin" : nombre.trim());
        sa.setActivo(true);
        return repository.save(sa);
    }

    public long cuantos() {
        return repository.count();
    }
}
