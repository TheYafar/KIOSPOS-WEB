package com.kioskpos.web.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Generación y hash del secreto de una caja. El token en claro se le entrega una sola
 * vez al navegador de la caja; el servidor guarda únicamente su SHA-256 (no es un
 * secreto reversible, pero se consulta por igualdad exacta, así que basta un hash
 * rápido — a diferencia de las contraseñas de humanos, que usan BCrypt).
 */
public final class Secretos {

    private static final SecureRandom RNG = new SecureRandom();

    private Secretos() {
    }

    /** Token aleatorio de 256 bits en Base64 URL-safe, para el navegador de la caja. */
    public static String nuevoTokenCaja() {
        byte[] b = new byte[32];
        RNG.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    public static String sha256Hex(String valor) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(valor.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo calcular SHA-256", e);
        }
    }
}
