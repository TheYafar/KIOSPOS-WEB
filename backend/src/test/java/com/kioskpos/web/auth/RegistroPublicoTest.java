package com.kioskpos.web.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Registro por cuenta propia: crea negocio + dueño en prueba y entra directo. */
@SpringBootTest(properties = "kioskpos.registro.max-por-hora=2")
class RegistroPublicoTest extends PostgresRlsTestBase {

    @Autowired private RegistroPublicoService registro;
    @Autowired private NegocioRepository negocios;

    private static RegistroPublicoService.DatosRegistro datos(String email, String clave) {
        return new RegistroPublicoService.DatosRegistro("Bodega La Esquina", "María Pérez", "0412-1234567", email, clave);
    }

    @Test
    void registraNegocioEnPruebaYDevuelveSesionDeDueno() {
        var reg = registro.registrar(datos("Nueva@Ejemplo.com", "clave-segura"), "10.0.0.1");
        var r = reg.login();
        assertThat(reg.codigoRecuperacion()).matches("[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}");
        assertThat(r.token()).isNotBlank();
        assertThat(r.rol()).isEqualTo(RolUsuario.DUENO);
        assertThat(r.nombreCompleto()).isEqualTo("María Pérez");
        Negocio n = negocios.findById(r.negocioId()).orElseThrow();
        assertThat(n.getNombre()).isEqualTo("Bodega La Esquina");
        assertThat(n.isEnPrueba()).isTrue();
        assertThat(n.getPlan()).isEqualTo("BASICO");
        assertThat(n.getCajasContratadas()).isEqualTo(1);
        assertThat(n.getTelefono()).isEqualTo("0412-1234567");
    }

    @Test
    void correoRepetidoNoDejaNegocioHuerfano() {
        registro.registrar(datos("repetido@ejemplo.com", "clave-segura"), "10.0.0.2");
        long antes = negocios.count();
        assertThatThrownBy(() -> registro.registrar(datos("REPETIDO@ejemplo.com", "otra-clave-1"), "10.0.0.3"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(negocios.count()).isEqualTo(antes);
    }

    @Test
    void validaDatosAntesDeCrear() {
        long antes = negocios.count();
        assertThatThrownBy(() -> registro.registrar(datos("corta@ejemplo.com", "1234567"), "10.0.0.4"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> registro.registrar(datos("no-es-correo", "clave-segura"), "10.0.0.4"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(negocios.count()).isEqualTo(antes);
    }

    @Test
    void limitaAltasPorIp() {
        registro.registrar(datos("ip1@ejemplo.com", "clave-segura"), "10.9.9.9");
        registro.registrar(datos("ip2@ejemplo.com", "clave-segura"), "10.9.9.9");
        assertThatThrownBy(() -> registro.registrar(datos("ip3@ejemplo.com", "clave-segura"), "10.9.9.9"))
                .isInstanceOf(IllegalStateException.class);
    }
}
