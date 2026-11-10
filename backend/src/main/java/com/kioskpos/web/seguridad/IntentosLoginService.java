package com.kioskpos.web.seguridad;

import com.kioskpos.web.auth.AuthException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Bloqueo por intentos fallidos (PIN del cajero, clave del dueño, super admin).
 * Tras {@code max} fallos seguidos, esa clave queda bloqueada {@code minutos}.
 * Un acierto borra el contador. Los fallos viejos (más de 1 h) no cuentan.
 *
 * Tabla de directorio sin RLS (intentos_login): se usa antes de que exista sesión.
 * Va por JDBC con UPSERT para ser atómico aunque lleguen intentos en paralelo.
 */
@Service
public class IntentosLoginService {

    private final JdbcTemplate jdbc;
    private final int max;
    private final int minutos;

    public IntentosLoginService(JdbcTemplate jdbc,
                                @Value("${kioskpos.login.max-intentos:5}") int max,
                                @Value("${kioskpos.login.bloqueo-minutos:15}") int minutos) {
        this.jdbc = jdbc;
        this.max = Math.max(1, max);
        this.minutos = Math.max(1, minutos);
    }

    public static String dueno(String correo) {
        return "dueno:" + correo;
    }

    public static String cajero(Long cajaId, Long usuarioId) {
        return "cajero:" + cajaId + ":" + usuarioId;
    }

    public static String admin(String correo) {
        return "admin:" + correo;
    }

    /** Lanza si la clave está bloqueada ahora. */
    public void verificar(String clave) {
        List<Timestamp> hasta = jdbc.queryForList(
                "SELECT bloqueado_hasta FROM intentos_login WHERE clave = ? AND bloqueado_hasta > now()",
                Timestamp.class, clave);
        if (!hasta.isEmpty()) {
            throw new AuthException(mensajeBloqueo(hasta.get(0).toInstant()));
        }
    }

    /**
     * Registra un fallo. Devuelve cuántos intentos le quedan (0 = acaba de quedar bloqueada,
     * y en ese caso lanza con el mensaje de bloqueo).
     */
    public int fallo(String clave) {
        Integer fallos = jdbc.queryForObject("""
                INSERT INTO intentos_login (clave, fallos, ultimo_fallo) VALUES (?, 1, now())
                ON CONFLICT (clave) DO UPDATE SET
                  fallos = CASE
                      WHEN intentos_login.bloqueado_hasta IS NOT NULL AND intentos_login.bloqueado_hasta <= now() THEN 1
                      WHEN intentos_login.ultimo_fallo < now() - interval '1 hour' THEN 1
                      ELSE intentos_login.fallos + 1 END,
                  bloqueado_hasta = CASE
                      WHEN intentos_login.bloqueado_hasta IS NOT NULL AND intentos_login.bloqueado_hasta <= now() THEN NULL
                      ELSE intentos_login.bloqueado_hasta END,
                  ultimo_fallo = now()
                RETURNING fallos
                """, Integer.class, clave);
        int f = fallos == null ? 1 : fallos;
        if (f >= max) {
            jdbc.update("UPDATE intentos_login SET bloqueado_hasta = now() + make_interval(mins => ?) WHERE clave = ?",
                    minutos, clave);
            throw new AuthException(mensajeBloqueo(Instant.now().plus(Duration.ofMinutes(minutos))));
        }
        return max - f;
    }

    public void exito(String clave) {
        jdbc.update("DELETE FROM intentos_login WHERE clave = ?", clave);
    }

    private static String mensajeBloqueo(Instant hasta) {
        long min = Math.max(1, (Duration.between(Instant.now(), hasta).getSeconds() + 59) / 60);
        return "Demasiados intentos fallidos. Por seguridad, espera " + min + (min == 1 ? " minuto" : " minutos")
                + " y vuelve a intentar.";
    }

    /** Texto para sumar al error: "Te quedan N intentos." (solo cuando quedan pocos). */
    public static String quedan(int n) {
        return n <= 3 ? " Te " + (n == 1 ? "queda 1 intento." : "quedan " + n + " intentos.") : "";
    }
}
