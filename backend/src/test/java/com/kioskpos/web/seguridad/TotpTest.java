package com.kioskpos.web.seguridad;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/** TOTP contra los vectores oficiales del RFC 6238 (SHA-1). */
class TotpTest {

    private static final String SECRETO = Totp.base32("12345678901234567890".getBytes(StandardCharsets.US_ASCII));

    @Test
    void vectoresDelRfc() {
        assertThat(Totp.codigo(SECRETO, 59L)).isEqualTo("287082");
        assertThat(Totp.codigo(SECRETO, 1111111109L)).isEqualTo("081804");
        assertThat(Totp.codigo(SECRETO, 1234567890L)).isEqualTo("005924");
    }

    @Test
    void validaElCodigoDeAhoraYRechazaOtros() {
        String s = Totp.nuevoSecreto();
        String ahora = Totp.codigo(s, System.currentTimeMillis() / 1000);
        assertThat(Totp.valido(s, ahora)).isTrue();
        assertThat(Totp.valido(s, "12345")).isFalse();
        assertThat(Totp.valido(s, null)).isFalse();
        assertThat(Totp.base32(Totp.desdeBase32(s))).isEqualTo(s);
    }
}
