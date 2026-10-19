package com.kioskpos.web.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.tenant.NegocioContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Flujo de autenticación del Paso 3, sobre Postgres real con RLS:
 *  - login de dueño con correo+contraseña,
 *  - login de cajero con PIN sobre una caja registrada,
 *  - y que nada de esto rompa el aislamiento por negocio.
 */
@SpringBootTest
class AuthFlowIsolationTest extends PostgresRlsTestBase {

    @Autowired
    private NegocioRegistroService negocioRegistroService;
    @Autowired
    private AuthService authService;
    @Autowired
    private UsuarioService usuarioService;
    @Autowired
    private CajaService cajaService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    @Test
    void loginDuenoConCorreoYContrasena() {
        var cocoa = negocioRegistroService.registrarNegocioConDueno(
                "Bodega Cocoa", "Uriel", "duenococoa@ejemplo.com", "clave-secreta");

        var r = authService.loginDueno("duenococoa@ejemplo.com", "clave-secreta");
        assertThat(r.token()).isNotBlank();
        assertThat(r.rol()).isEqualTo(RolUsuario.DUENO);
        assertThat(r.negocioId()).isEqualTo(cocoa.negocioId());
        assertThat(r.cajaId()).isNull();

        // El correo normaliza a minúsculas; la contraseña mala se rechaza con mensaje genérico.
        assertThat(authService.loginDueno("DUENOCOCOA@EJEMPLO.COM", "clave-secreta").token()).isNotBlank();
        assertThatThrownBy(() -> authService.loginDueno("duenococoa@ejemplo.com", "mala"))
                .isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> authService.loginDueno("noexiste@ejemplo.com", "x"))
                .isInstanceOf(AuthException.class);
    }

    @Test
    void loginCajeroConPinSobreCajaRegistrada() {
        var cocoa = negocioRegistroService.registrarNegocioConDueno(
                "Bodega Cocoa", "Uriel", "dueno2@ejemplo.com", "clave-secreta");

        String cajaToken;
        Long cajeroId;
        try {
            NegocioContext.set(cocoa.negocioId());
            cajeroId = usuarioService.crearCajero("Ana", "1234").getId();
            cajaToken = cajaService.registrar("Caja 1", null).tokenClaro();
        } finally {
            NegocioContext.clear();
        }

        var r = authService.loginCajero(cajaToken, cajeroId, "1234");
        assertThat(r.rol()).isEqualTo(RolUsuario.CAJERO);
        assertThat(r.negocioId()).isEqualTo(cocoa.negocioId());
        assertThat(r.cajaId()).isNotNull();

        assertThatThrownBy(() -> authService.loginCajero(cajaToken, cajeroId, "0000"))
                .isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> authService.loginCajero("token-inventado", cajeroId, "1234"))
                .isInstanceOf(AuthException.class);
    }

    @Test
    void laCajaDeUnNegocioNoSirveParaUnCajeroDeOtro() {
        var cocoa = negocioRegistroService.registrarNegocioConDueno(
                "Bodega Cocoa", "Uriel", "dueno3@ejemplo.com", "clave-secreta");
        var esquina = negocioRegistroService.registrarNegocioConDueno(
                "Bodega La Esquina", "Pedro", "dueno4@ejemplo.com", "clave-secreta");

        String cajaTokenCocoa;
        Long cajeroEsquinaId;
        try {
            NegocioContext.set(cocoa.negocioId());
            cajaTokenCocoa = cajaService.registrar("Caja Cocoa", null).tokenClaro();
        } finally {
            NegocioContext.clear();
        }
        try {
            NegocioContext.set(esquina.negocioId());
            cajeroEsquinaId = usuarioService.crearCajero("Luis (Esquina)", "5555").getId();
        } finally {
            NegocioContext.clear();
        }

        // Con la caja de Cocoa, el contexto queda en Cocoa; el cajero de La Esquina
        // es invisible bajo RLS -> el login falla (no se puede cruzar de negocio).
        assertThatThrownBy(() -> authService.loginCajero(cajaTokenCocoa, cajeroEsquinaId, "5555"))
                .isInstanceOf(AuthException.class);
    }

    @Test
    void listarUsuariosSoloVeLosDelNegocioDeLaSesion() {
        var cocoa = negocioRegistroService.registrarNegocioConDueno(
                "Bodega Cocoa", "Uriel", "dueno5@ejemplo.com", "clave-secreta");
        var esquina = negocioRegistroService.registrarNegocioConDueno(
                "Bodega La Esquina", "Pedro", "dueno6@ejemplo.com", "clave-secreta");

        try {
            NegocioContext.set(cocoa.negocioId());
            usuarioService.crearCajero("Ana", "1234");
        } finally {
            NegocioContext.clear();
        }

        try {
            NegocioContext.set(cocoa.negocioId());
            assertThat(usuarioService.listar()).extracting(Usuario::getNombreCompleto)
                    .containsExactlyInAnyOrder("Uriel", "Ana");
        } finally {
            NegocioContext.clear();
        }

        try {
            NegocioContext.set(esquina.negocioId());
            assertThat(usuarioService.listar()).extracting(Usuario::getNombreCompleto)
                    .containsExactly("Pedro");
        } finally {
            NegocioContext.clear();
        }
    }
}
