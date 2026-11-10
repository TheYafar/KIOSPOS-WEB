package com.kioskpos.web.seguridad;

import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Códigos de un solo uso por tiempo (TOTP, RFC 6238): los de Google Authenticator,
 * Authy, Microsoft Authenticator... 6 dígitos, cada 30 s, HMAC-SHA1. Solo JDK.
 */
public final class Totp {

    private static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final SecureRandom RNG = new SecureRandom();

    private Totp() {
    }

    /** Secreto nuevo de 160 bits en Base32 (lo que se escanea en la app). */
    public static String nuevoSecreto() {
        byte[] b = new byte[20];
        RNG.nextBytes(b);
        return base32(b);
    }

    public static String uri(String secreto, String cuenta, String emisor) {
        String e = URLEncoder.encode(emisor, StandardCharsets.UTF_8).replace("+", "%20");
        String c = URLEncoder.encode(cuenta, StandardCharsets.UTF_8).replace("+", "%20");
        return "otpauth://totp/" + e + ":" + c + "?secret=" + secreto + "&issuer=" + e + "&digits=6&period=30";
    }

    /** Código para un instante (segundos epoch). */
    public static String codigo(String secreto, long epochSegundos) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(desdeBase32(secreto), "HmacSHA1"));
            byte[] h = mac.doFinal(ByteBuffer.allocate(8).putLong(epochSegundos / 30).array());
            int o = h[h.length - 1] & 0x0f;
            int bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
            return String.format("%06d", bin % 1_000_000);
        } catch (Exception ex) {
            throw new IllegalStateException("No se pudo calcular el código", ex);
        }
    }

    /** ¿Es válido el código ahora? Acepta ±1 paso (30 s) por desfase de reloj. */
    public static boolean valido(String secreto, String codigo) {
        if (secreto == null || codigo == null) {
            return false;
        }
        String c = codigo.replaceAll("\\s", "");
        if (!c.matches("\\d{6}")) {
            return false;
        }
        long ahora = System.currentTimeMillis() / 1000;
        for (int d = -1; d <= 1; d++) {
            if (igual(codigo(secreto, ahora + d * 30L), c)) {
                return true;
            }
        }
        return false;
    }

    private static boolean igual(String a, String b) {
        return java.security.MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII), b.getBytes(StandardCharsets.US_ASCII));
    }

    static String base32(byte[] datos) {
        StringBuilder sb = new StringBuilder();
        int buffer = 0;
        int bits = 0;
        for (byte b : datos) {
            buffer = (buffer << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                sb.append(B32.charAt((buffer >> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        if (bits > 0) {
            sb.append(B32.charAt((buffer << (5 - bits)) & 31));
        }
        return sb.toString();
    }

    static byte[] desdeBase32(String s) {
        String t = s.replace("=", "").replace(" ", "").toUpperCase();
        ByteBuffer out = ByteBuffer.allocate(t.length() * 5 / 8);
        int buffer = 0;
        int bits = 0;
        for (char ch : t.toCharArray()) {
            int v = B32.indexOf(ch);
            if (v < 0) {
                throw new IllegalArgumentException("Secreto Base32 inválido");
            }
            buffer = (buffer << 5) | v;
            bits += 5;
            if (bits >= 8) {
                out.put((byte) ((buffer >> (bits - 8)) & 0xff));
                bits -= 8;
            }
        }
        return out.array();
    }
}
