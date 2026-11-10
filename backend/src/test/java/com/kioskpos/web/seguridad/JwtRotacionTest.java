package com.kioskpos.web.seguridad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.security.JwtService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import org.junit.jupiter.api.Test;

/** Rotar la clave JWT sin sacar a todos: la anterior se acepta, no se usa para firmar. */
class JwtRotacionTest {

    private static final String VIEJA = "clave-vieja-de-al-menos-treinta-y-dos-bytes!!";
    private static final String NUEVA = "clave-nueva-de-al-menos-treinta-y-dos-bytes!!";
    private final KioskPrincipal p = new KioskPrincipal(1L, 7L, RolUsuario.DUENO, null);

    @Test
    void tokenFirmadoConLaAnteriorSigueValiendoDuranteLaRotacion() {
        String viejo = new JwtService(VIEJA, 720, 10, "").emitir(p);
        JwtService rotando = new JwtService(NUEVA, 720, 10, VIEJA);
        assertThat(rotando.validar(viejo).negocioId()).isEqualTo(7L);
        assertThat(rotando.validar(rotando.emitir(p)).usuarioId()).isEqualTo(1L);
        // Terminada la rotación (sin anterior), el viejo ya no sirve.
        assertThatThrownBy(() -> new JwtService(NUEVA, 720, 10, "").validar(viejo)).isInstanceOf(Exception.class);
    }
}
