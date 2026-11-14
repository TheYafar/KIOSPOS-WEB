package com.kioskpos.web.auth.web;

import com.kioskpos.web.auth.AuthService;
import com.kioskpos.web.auth.RegistroPublicoService;
import com.kioskpos.web.correo.EmailService;
import com.kioskpos.web.demo.DemoService;
import com.kioskpos.web.seguridad.RecuperacionService;
import jakarta.servlet.http.HttpServletRequest;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.seguridad.RecuperarClaveService;
import java.util.Map;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {

    private final AuthService authService;
    private final RecuperarClaveService recuperarClaveService;
    private final RegistroPublicoService registroPublicoService;
    private final RecuperacionService recuperacionService;
    private final DemoService demoService;
    private final EmailService emailService;

    public AuthController(AuthService authService, RecuperarClaveService recuperarClaveService,
                          RegistroPublicoService registroPublicoService, RecuperacionService recuperacionService,
                          DemoService demoService, EmailService emailService) {
        this.authService = authService;
        this.recuperarClaveService = recuperarClaveService;
        this.registroPublicoService = registroPublicoService;
        this.recuperacionService = recuperacionService;
        this.demoService = demoService;
        this.emailService = emailService;
    }

    /** Qué ofrece la pantalla de entrada: registro, demo y si hay correo para recuperar la clave. */
    @GetMapping("/auth/opciones")
    public Map<String, Boolean> opciones() {
        return Map.of("registro", registroPublicoService.abierto(), "demo", demoService.abierta(),
                "correo", emailService.activo());
    }

    /** Registro por cuenta propia: crea el negocio y el dueño, y deja la sesión iniciada. */
    @PostMapping("/auth/registro")
    public RegistroResponse registro(@RequestBody RegistroPublicoService.DatosRegistro req, HttpServletRequest http) {
        var r = registroPublicoService.registrar(req, ipDe(http));
        return new RegistroResponse(TokenResponse.de(r.login()), r.codigoRecuperacion());
    }

    public record RegistroResponse(TokenResponse sesion, String codigoRecuperacion) {
    }

    /** "Probar la demo": una bodega de muestra solo para este visitante (24 h). */
    @PostMapping("/auth/demo")
    public DemoService.DemoCreada demo(HttpServletRequest http) {
        return demoService.crear(ipDe(http));
    }

    /** Olvidé mi contraseña SIN correo: correo + código de recuperación → clave nueva (y código nuevo). */
    @PostMapping("/auth/recuperar-con-codigo")
    public RecuperacionService.Recuperada recuperarConCodigo(@RequestBody RecuperarCodigoRequest req) {
        return recuperacionService.recuperar(req.email(), req.codigo(), req.password());
    }

    public record RecuperarCodigoRequest(String email, String codigo, String password) {
    }

    /** IP real del cliente detrás de nginx (X-Real-IP), o la de la conexión. */
    private static String ipDe(HttpServletRequest http) {
        String real = http.getHeader("X-Real-IP");
        if (real != null && !real.isBlank()) {
            return real.trim();
        }
        String xff = http.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return http.getRemoteAddr();
    }

    /** "Olvidé mi contraseña": siempre responde igual (no revela si el correo existe). */
    @PostMapping("/auth/olvide-clave")
    public Map<String, String> olvideClave(@RequestBody OlvideRequest req) {
        recuperarClaveService.solicitar(req.email());
        return Map.of("mensaje", "Si ese correo está registrado, te llegará un enlace para cambiar la contraseña.");
    }

    /** Pone la contraseña nueva con el enlace (un solo uso). */
    @PostMapping("/auth/restablecer-clave")
    public Map<String, String> restablecer(@RequestBody RestablecerRequest req) {
        return Map.of("email", recuperarClaveService.restablecer(req.token(), req.password()));
    }

    public record OlvideRequest(String email) {
    }

    public record RestablecerRequest(String token, String password) {
    }

    /** Login de dueño/encargado con correo + contraseña (desde cualquier lado). */
    @PostMapping("/auth/login-dueno")
    public TokenResponse loginDueno(@RequestBody LoginDuenoRequest req) {
        return TokenResponse.de(authService.loginDueno(req.email(), req.password()));
    }

    /** Login de cajero con PIN, sobre una caja registrada. */
    @PostMapping("/auth/login-cajero")
    public TokenResponse loginCajero(@RequestBody LoginCajeroRequest req) {
        return TokenResponse.de(authService.loginCajero(req.cajaToken(), req.usuarioId(), req.pin()));
    }

    /** Lista de cajeros para la pantalla de bloqueo de una caja (autenticada por su token). */
    @GetMapping("/caja/cajeros")
    public List<AuthService.CajeroResumen> cajeros(@RequestHeader("X-Caja-Token") String cajaToken) {
        return authService.listarCajerosDeCaja(cajaToken);
    }

    public record LoginDuenoRequest(@NotBlank String email, @NotBlank String password) {
    }

    public record LoginCajeroRequest(
            @NotBlank String cajaToken, @NotNull Long usuarioId, @NotBlank String pin) {
    }

    public record TokenResponse(String token, Long usuarioId, String nombreCompleto,
                                RolUsuario rol, Long negocioId, Long cajaId) {
        static TokenResponse de(AuthService.ResultadoLogin r) {
            return new TokenResponse(r.token(), r.usuarioId(), r.nombreCompleto(),
                    r.rol(), r.negocioId(), r.cajaId());
        }
    }
}
