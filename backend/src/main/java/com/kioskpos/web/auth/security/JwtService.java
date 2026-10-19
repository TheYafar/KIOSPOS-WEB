package com.kioskpos.web.auth.security;

import com.kioskpos.web.auth.RolUsuario;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Emite y valida los JWT de sesión, firmados por el servidor (HS256). El servidor
 * es la única autoridad: la expiración se valida contra el reloj del servidor.
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final Duration ttl;

    public JwtService(
            @Value("${kioskpos.jwt.secret}") String secret,
            @Value("${kioskpos.jwt.ttl-minutes:720}") long ttlMinutes) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException(
                    "kioskpos.jwt.secret debe tener al menos 32 bytes (256 bits) para HS256");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.ttl = Duration.ofMinutes(ttlMinutes);
    }

    public String emitir(KioskPrincipal p) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(String.valueOf(p.usuarioId()))
                .claim("neg", p.negocioId())
                .claim("rol", p.rol().name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)));
        if (p.cajaId() != null) {
            builder.claim("caja", p.cajaId());
        }
        return builder.signWith(key).compact();
    }

    /**
     * Valida la firma y la expiración y devuelve el principal. Lanza excepción si el
     * token es inválido o está vencido.
     */
    public KioskPrincipal validar(String token) {
        Claims c = Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        Long cajaId = c.get("caja") == null ? null : ((Number) c.get("caja")).longValue();
        return new KioskPrincipal(
                Long.valueOf(c.getSubject()),
                ((Number) c.get("neg")).longValue(),
                RolUsuario.valueOf(c.get("rol", String.class)),
                cajaId);
    }
}
