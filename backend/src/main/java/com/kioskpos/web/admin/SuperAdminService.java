package com.kioskpos.web.admin;

import com.kioskpos.web.auth.AuthException;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.security.JwtService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.seguridad.IntentosLoginService;
import com.kioskpos.web.seguridad.Totp;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Login del super admin (global, sin negocio). El token resultante no lleva neg claim,
 * así que el filtro no fija ningún NegocioContext: el super admin opera de forma
 * transversal (las tablas de facturación no tienen RLS y para mirar datos de un
 * negocio concreto se fija el contexto explícitamente, ver AdminService).
 *
 * Verificación en dos pasos (TOTP, app de autenticación): una vez activada, el login
 * exige además el código de 6 dígitos. Clave y código cuentan para el bloqueo por intentos.
 */
@Service
public class SuperAdminService {

    private final SuperAdminRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final IntentosLoginService intentos;

    public SuperAdminService(SuperAdminRepository repository,
                             PasswordEncoder passwordEncoder,
                             JwtService jwtService,
                             IntentosLoginService intentos) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.intentos = intentos;
    }

    /** Falta el código de 6 dígitos (la clave sí era correcta). */
    public static class Requiere2faException extends RuntimeException {
        public Requiere2faException() {
            super("Escribe el código de 6 dígitos de tu app de autenticación");
        }
    }

    public String login(String email, String password) {
        return login(email, password, null);
    }

    public String login(String email, String password, String codigo) {
        String correo = email == null ? "" : email.trim().toLowerCase();
        String clave = IntentosLoginService.admin(correo);
        intentos.verificar(clave);
        SuperAdmin sa = repository.findByEmail(correo).orElse(null);
        boolean ok = sa != null
                && sa.isActivo()
                && passwordEncoder.matches(password == null ? "" : password, sa.getPasswordHash());
        if (!ok) {
            int quedan = intentos.fallo(clave);
            throw new AuthException("Correo o contraseña incorrectos." + IntentosLoginService.quedan(quedan));
        }
        if (sa.isTotpActivo()) {
            if (codigo == null || codigo.isBlank()) {
                throw new Requiere2faException();
            }
            if (!Totp.valido(sa.getTotpSecreto(), codigo)) {
                int quedan = intentos.fallo(clave);
                throw new AuthException("Código incorrecto." + IntentosLoginService.quedan(quedan));
            }
        }
        intentos.exito(clave);
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

    // ---------- Verificación en dos pasos ----------

    public record Estado2fa(boolean activo) {
    }

    public record Inicio2fa(String secreto, String uri) {
    }

    public Estado2fa estado2fa(Long id) {
        return new Estado2fa(buscar(id).isTotpActivo());
    }

    /** Genera un secreto nuevo (aún inactivo) para escanear en la app. */
    @Transactional
    public Inicio2fa iniciar2fa(Long id) {
        SuperAdmin sa = buscar(id);
        if (sa.isTotpActivo()) {
            throw new IllegalStateException("La verificación en dos pasos ya está activa");
        }
        String secreto = Totp.nuevoSecreto();
        sa.setTotpSecreto(secreto);
        repository.save(sa);
        return new Inicio2fa(secreto, Totp.uri(secreto, sa.getEmail(), "KioskPOS Admin"));
    }

    /** Activa la 2FA si el código de la app coincide con el secreto generado. */
    @Transactional
    public Estado2fa activar2fa(Long id, String codigo) {
        SuperAdmin sa = buscar(id);
        if (sa.getTotpSecreto() == null) {
            throw new IllegalArgumentException("Primero genera el código QR");
        }
        if (!Totp.valido(sa.getTotpSecreto(), codigo)) {
            throw new IllegalArgumentException("Código incorrecto. Revisa la hora del teléfono y prueba otra vez.");
        }
        sa.setTotpActivo(true);
        repository.save(sa);
        return new Estado2fa(true);
    }

    /** Desactivar exige un código válido (no basta con tener la sesión abierta). */
    @Transactional
    public Estado2fa desactivar2fa(Long id, String codigo) {
        SuperAdmin sa = buscar(id);
        if (sa.isTotpActivo() && !Totp.valido(sa.getTotpSecreto(), codigo)) {
            throw new IllegalArgumentException("Código incorrecto");
        }
        sa.setTotpActivo(false);
        sa.setTotpSecreto(null);
        repository.save(sa);
        return new Estado2fa(false);
    }

    private SuperAdmin buscar(Long id) {
        return repository.findById(id).orElseThrow(() -> new IllegalArgumentException("Super admin no encontrado"));
    }

    public long cuantos() {
        return repository.count();
    }
}
