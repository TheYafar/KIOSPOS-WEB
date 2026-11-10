package com.kioskpos.web.seguridad;

import com.kioskpos.web.auth.CuentaLogin;
import com.kioskpos.web.auth.CuentaLoginRepository;
import com.kioskpos.web.auth.Secretos;
import com.kioskpos.web.correo.EmailService;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * "Olvidé mi contraseña" del dueño/encargado. Se genera un enlace de un solo uso
 * (se guarda solo su SHA-256) que llega por correo, o que el super admin genera y
 * le pasa por WhatsApp si el correo no está configurado.
 */
@Service
public class RecuperarClaveService {

    static final Duration TTL_CORREO = Duration.ofMinutes(30);
    static final Duration TTL_ADMIN = Duration.ofHours(24);

    private final JdbcTemplate jdbc;
    private final CuentaLoginRepository cuentas;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;
    private final IntentosLoginService intentos;
    private final String appUrl;

    public RecuperarClaveService(JdbcTemplate jdbc, CuentaLoginRepository cuentas, PasswordEncoder passwordEncoder,
                                 EmailService emailService, IntentosLoginService intentos,
                                 @Value("${kioskpos.mail.app-url:https://app.kioskpos.app}") String appUrl) {
        this.jdbc = jdbc;
        this.cuentas = cuentas;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
        this.intentos = intentos;
        this.appUrl = appUrl.endsWith("/") ? appUrl.substring(0, appUrl.length() - 1) : appUrl;
    }

    /**
     * Pide el enlace por correo. Nunca dice si el correo existe (respuesta siempre igual).
     * Máximo 3 pedidos por hora por correo, para no usarlo de spam.
     */
    public void solicitar(String email) {
        String correo = email == null ? "" : email.trim().toLowerCase();
        CuentaLogin c = cuentas.findByEmail(correo).filter(CuentaLogin::isActivo).orElse(null);
        if (c == null) {
            return;
        }
        Integer recientes = jdbc.queryForObject(
                "SELECT count(*) FROM reset_clave WHERE cuenta_login_id = ? AND creado > now() - interval '1 hour'",
                Integer.class, c.getId());
        if (recientes != null && recientes >= 3) {
            return;
        }
        String enlace = crearEnlace(c.getId(), TTL_CORREO);
        emailService.recuperarClave(correo, enlace);
    }

    /** El super admin genera el enlace para el dueño de un negocio (lo envía él). */
    public String enlaceParaDueno(Long negocioId) {
        CuentaLogin c = cuentas.findFirstByNegocioIdOrderByIdAsc(negocioId)
                .orElseThrow(() -> new IllegalArgumentException("Ese negocio no tiene cuenta de dueño"));
        return crearEnlace(c.getId(), TTL_ADMIN);
    }

    private String crearEnlace(Long cuentaId, Duration ttl) {
        // Solo vale el último enlace: los anteriores sin usar se invalidan.
        jdbc.update("UPDATE reset_clave SET usado = TRUE WHERE cuenta_login_id = ? AND usado = FALSE", cuentaId);
        String token = Secretos.nuevoTokenCaja();
        jdbc.update("INSERT INTO reset_clave (cuenta_login_id, token_hash, expira) VALUES (?, ?, ?)",
                cuentaId, Secretos.sha256Hex(token), Timestamp.from(Instant.now().plus(ttl)));
        return appUrl + "/#reset=" + token;
    }

    /** Cambia la contraseña con el enlace. Devuelve el correo de la cuenta (para entrar). */
    @Transactional
    public String restablecer(String token, String nueva) {
        if (nueva == null || nueva.length() < 8) {
            throw new IllegalArgumentException("La contraseña debe tener al menos 8 caracteres");
        }
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("El enlace no es válido");
        }
        List<Long> ids = jdbc.queryForList("""
                UPDATE reset_clave SET usado = TRUE
                WHERE token_hash = ? AND usado = FALSE AND expira > now()
                RETURNING cuenta_login_id
                """, Long.class, Secretos.sha256Hex(token.trim()));
        if (ids.isEmpty()) {
            throw new IllegalArgumentException("El enlace venció o ya se usó. Pide uno nuevo.");
        }
        CuentaLogin c = cuentas.findById(ids.get(0))
                .orElseThrow(() -> new IllegalArgumentException("El enlace no es válido"));
        c.setPasswordHash(passwordEncoder.encode(nueva));
        cuentas.save(c);
        intentos.exito(IntentosLoginService.dueno(c.getEmail()));
        return c.getEmail();
    }
}
