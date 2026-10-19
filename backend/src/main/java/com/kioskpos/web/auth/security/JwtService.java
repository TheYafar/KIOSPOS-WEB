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
 * Emite y valida los tokens firmados por el servidor (HS256). El servidor es la
 * única autoridad: la expiración se valida contra el reloj del servidor.
 *
 * Dos tipos de token, con el claim "tipo" para que no se puedan confundir:
 *  - "sesion": quién eres (login de dueño o cajero). TTL largo (horas).
 *  - "permiso": la caja PUEDE cobrar ahora. TTL corto (minutos, el lease); se renueva
 *    cada pocos minutos y solo si el negocio está al día (ver SuscripcionService).
 */
@Service
public class JwtService {

    private static final String TIPO_SESION = "sesion";
    private static final String TIPO_PERMISO = "permiso";

    private final SecretKey key;
    private final Duration sesionTtl;
    private final Duration permisoTtl;

    public JwtService(
            @Value("${kioskpos.jwt.secret}") String secret,
            @Value("${kioskpos.jwt.ttl-minutes:720}") long sesionTtlMinutes,
            @Value("${kioskpos.permiso.lease-minutes:10}") long permisoTtlMinutes) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException(
                    "kioskpos.jwt.secret debe tener al menos 32 bytes (256 bits) para HS256");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.sesionTtl = Duration.ofMinutes(sesionTtlMinutes);
        this.permisoTtl = Duration.ofMinutes(permisoTtlMinutes);
    }

    // ---------- Token de sesión ----------

    public String emitir(KioskPrincipal p) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(String.valueOf(p.usuarioId()))
                .claim("tipo", TIPO_SESION)
                .claim("rol", p.rol().name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(sesionTtl)));
        if (p.negocioId() != null) {
            builder.claim("neg", p.negocioId());
        }
        if (p.cajaId() != null) {
            builder.claim("caja", p.cajaId());
        }
        return builder.signWith(key).compact();
    }

    /** Valida firma, expiración y que sea un token de SESIÓN. Lanza si es inválido. */
    public KioskPrincipal validar(String token) {
        Claims c = parse(token);
        if (!TIPO_SESION.equals(c.get("tipo", String.class))) {
            throw new IllegalArgumentException("Tipo de token inválido");
        }
        Long negocioId = c.get("neg") == null ? null : ((Number) c.get("neg")).longValue();
        Long cajaId = c.get("caja") == null ? null : ((Number) c.get("caja")).longValue();
        Long usuarioId = c.getSubject() == null ? null : Long.valueOf(c.getSubject());
        return new KioskPrincipal(usuarioId, negocioId,
                RolUsuario.valueOf(c.get("rol", String.class)), cajaId);
    }

    // ---------- Permiso (lease de cobro) ----------

    public String emitirPermiso(Long negocioId, Long cajaId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .claim("tipo", TIPO_PERMISO)
                .claim("neg", negocioId)
                .claim("caja", cajaId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(permisoTtl)))
                .signWith(key)
                .compact();
    }

    /** Valida firma, expiración y que sea un PERMISO. Lanza si es inválido o venció. */
    public Permiso validarPermiso(String token) {
        Claims c = parse(token);
        if (!TIPO_PERMISO.equals(c.get("tipo", String.class))) {
            throw new IllegalArgumentException("Tipo de token inválido");
        }
        return new Permiso(((Number) c.get("neg")).longValue(),
                ((Number) c.get("caja")).longValue(),
                c.getExpiration().toInstant());
    }

    public long permisoLeaseMinutos() {
        return permisoTtl.toMinutes();
    }

    private Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }

    public record Permiso(Long negocioId, Long cajaId, Instant expira) {
    }
}
