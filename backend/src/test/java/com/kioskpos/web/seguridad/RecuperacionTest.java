package com.kioskpos.web.seguridad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.AuthException;
import com.kioskpos.web.auth.AuthService;
import com.kioskpos.web.auth.RegistroPublicoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Olvidé mi contraseña SIN correo: correo + código de recuperación. */
@SpringBootTest
class RecuperacionTest extends PostgresRlsTestBase {

    @Autowired private RegistroPublicoService registro;
    @Autowired private RecuperacionService recuperacion;
    @Autowired private AuthService auth;

    @Test
    void conElCodigoPoneClaveNuevaYElCodigoSeCambia() {
        var reg = registro.registrar(new RegistroPublicoService.DatosRegistro(
                "Bodega Rec", "Rosa", null, "rosa@ejemplo.com", "clave-vieja-1"), "10.1.1.1");
        String codigo = reg.codigoRecuperacion();

        // Escrito en minúsculas y sin guiones también vale.
        var r = recuperacion.recuperar("ROSA@ejemplo.com", codigo.toLowerCase().replace("-", ""), "clave-nueva-1");
        assertThat(r.codigoNuevo()).isNotEqualTo(codigo);
        assertThat(auth.loginDueno("rosa@ejemplo.com", "clave-nueva-1").token()).isNotBlank();
        assertThatThrownBy(() -> auth.loginDueno("rosa@ejemplo.com", "clave-vieja-1")).isInstanceOf(AuthException.class);

        // El código usado ya no sirve; el nuevo sí.
        assertThatThrownBy(() -> recuperacion.recuperar("rosa@ejemplo.com", codigo, "otra-clave-1"))
                .isInstanceOf(AuthException.class);
        assertThat(recuperacion.recuperar("rosa@ejemplo.com", r.codigoNuevo(), "otra-clave-2").codigoNuevo()).isNotBlank();
    }

    @Test
    void codigoEquivocadoNoCambiaNada() {
        registro.registrar(new RegistroPublicoService.DatosRegistro(
                "Bodega Rec2", "Pedro", null, "pedro@ejemplo.com", "clave-pedro-1"), "10.1.1.2");
        assertThatThrownBy(() -> recuperacion.recuperar("pedro@ejemplo.com", "AAAA-BBBB-CCCC", "clave-mala-1"))
                .isInstanceOf(AuthException.class);
        assertThat(auth.loginDueno("pedro@ejemplo.com", "clave-pedro-1").token()).isNotBlank();
    }
}
