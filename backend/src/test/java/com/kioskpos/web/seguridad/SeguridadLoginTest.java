package com.kioskpos.web.seguridad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.admin.SuperAdminService;
import com.kioskpos.web.auth.AuthException;
import com.kioskpos.web.auth.AuthService;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.tenant.NegocioContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Sección 3: bloqueo por intentos, recuperar contraseña y 2FA del super admin. */
@SpringBootTest
class SeguridadLoginTest extends PostgresRlsTestBase {

    @Autowired
    private NegocioRegistroService negocioRegistroService;
    @Autowired
    private AuthService authService;
    @Autowired
    private UsuarioService usuarioService;
    @Autowired
    private CajaService cajaService;
    @Autowired
    private RecuperarClaveService recuperarClaveService;
    @Autowired
    private SuperAdminService superAdminService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    @Test
    void elPinSeBloqueaTrasCincoFallos() {
        var n = negocioRegistroService.registrarNegocioConDueno("Bloqueo", "Uriel", "bloq@ejemplo.com", "clave-secreta");
        String token;
        Long cajeroId;
        try {
            NegocioContext.set(n.negocioId());
            cajeroId = usuarioService.crearCajero("Ana", "1234").getId();
            token = cajaService.registrar("Caja 1", null).tokenClaro();
        } finally {
            NegocioContext.clear();
        }
        // Un acierto borra los fallos previos.
        assertThatThrownBy(() -> authService.loginCajero(token, cajeroId, "0000")).isInstanceOf(AuthException.class);
        assertThat(authService.loginCajero(token, cajeroId, "1234").token()).isNotBlank();

        for (int i = 1; i <= 4; i++) {
            assertThatThrownBy(() -> authService.loginCajero(token, cajeroId, "9999"))
                    .isInstanceOf(AuthException.class).hasMessageStartingWith("PIN incorrecto");
        }
        assertThatThrownBy(() -> authService.loginCajero(token, cajeroId, "9999"))
                .isInstanceOf(AuthException.class).hasMessageContaining("Demasiados intentos");
        // Bloqueado: ni con el PIN correcto entra hasta que pase el tiempo.
        assertThatThrownBy(() -> authService.loginCajero(token, cajeroId, "1234"))
                .isInstanceOf(AuthException.class).hasMessageContaining("Demasiados intentos");
    }

    @Test
    void laClaveDelDuenoAvisaCuantosIntentosQuedan() {
        negocioRegistroService.registrarNegocioConDueno("Avisos", "Uriel", "avisos@ejemplo.com", "clave-secreta");
        assertThatThrownBy(() -> authService.loginDueno("avisos@ejemplo.com", "x1"))
                .isInstanceOf(AuthException.class).hasMessage("Correo o contraseña incorrectos.");
        assertThatThrownBy(() -> authService.loginDueno("avisos@ejemplo.com", "x2"))
                .isInstanceOf(AuthException.class).hasMessageContaining("Te quedan 3 intentos");
        assertThat(authService.loginDueno("avisos@ejemplo.com", "clave-secreta").token()).isNotBlank();
        // Tras entrar bien, el contador vuelve a cero.
        assertThatThrownBy(() -> authService.loginDueno("avisos@ejemplo.com", "x3"))
                .isInstanceOf(AuthException.class).hasMessage("Correo o contraseña incorrectos.");
    }

    @Test
    void recuperarContrasenaConEnlaceDeUnSoloUso() {
        var n = negocioRegistroService.registrarNegocioConDueno("Olvido", "Uriel", "olvido@ejemplo.com", "clave-vieja");
        String enlace = recuperarClaveService.enlaceParaDueno(n.negocioId());
        assertThat(enlace).contains("/#reset=");
        String token = enlace.substring(enlace.indexOf("#reset=") + 7);

        assertThatThrownBy(() -> recuperarClaveService.restablecer(token, "corta"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(recuperarClaveService.restablecer(token, "clave-nueva-123")).isEqualTo("olvido@ejemplo.com");
        assertThat(authService.loginDueno("olvido@ejemplo.com", "clave-nueva-123").token()).isNotBlank();
        assertThatThrownBy(() -> authService.loginDueno("olvido@ejemplo.com", "clave-vieja")).isInstanceOf(AuthException.class);
        // El enlace no se puede reusar; uno nuevo invalida el anterior.
        assertThatThrownBy(() -> recuperarClaveService.restablecer(token, "otra-clave-123"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("venció o ya se usó");
        String e1 = recuperarClaveService.enlaceParaDueno(n.negocioId());
        recuperarClaveService.enlaceParaDueno(n.negocioId());
        assertThatThrownBy(() -> recuperarClaveService.restablecer(e1.substring(e1.indexOf("#reset=") + 7), "otra-clave-123"))
                .isInstanceOf(IllegalArgumentException.class);
        // Pedirlo por correo nunca revela si existe.
        recuperarClaveService.solicitar("noexiste@ejemplo.com");
    }

    @Test
    void superAdminConVerificacionEnDosPasos() {
        var sa = superAdminService.crear("sa2fa@ejemplo.com", "clave-super-1", "Uriel");
        var ini = superAdminService.iniciar2fa(sa.getId());
        assertThat(ini.uri()).startsWith("otpauth://totp/").contains("secret=" + ini.secreto());
        assertThatThrownBy(() -> superAdminService.activar2fa(sa.getId(), "000000"))
                .isInstanceOf(IllegalArgumentException.class);
        superAdminService.activar2fa(sa.getId(), Totp.codigo(ini.secreto(), System.currentTimeMillis() / 1000));

        assertThatThrownBy(() -> superAdminService.login("sa2fa@ejemplo.com", "clave-super-1", null))
                .isInstanceOf(SuperAdminService.Requiere2faException.class);
        assertThat(superAdminService.login("sa2fa@ejemplo.com", "clave-super-1",
                Totp.codigo(ini.secreto(), System.currentTimeMillis() / 1000))).isNotBlank();
        assertThatThrownBy(() -> superAdminService.login("sa2fa@ejemplo.com", "clave-super-1", "123456"))
                .isInstanceOf(AuthException.class);
    }
}
