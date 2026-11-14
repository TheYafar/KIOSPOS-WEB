package com.kioskpos.web.seguridad;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Límite simple en memoria: como mucho {@code max} acciones por IP dentro de una ventana
 * (p. ej. altas de negocio o demos por hora). Frena abusos de endpoints públicos.
 */
public class LimitePorIp {

    private final int max;
    private final Duration ventana;
    private final String mensaje;
    private final Map<String, Deque<Instant>> porIp = new ConcurrentHashMap<>();

    public LimitePorIp(int max, Duration ventana, String mensaje) {
        this.max = max;
        this.ventana = ventana;
        this.mensaje = mensaje;
    }

    /** Cuenta una acción para esa IP; lanza si ya llegó al tope en la ventana. */
    public void contar(String ip) {
        String clave = ip == null || ip.isBlank() ? "?" : ip;
        Instant ahora = Instant.now();
        Deque<Instant> q = porIp.computeIfAbsent(clave, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst().isBefore(ahora.minus(ventana))) {
                q.pollFirst();
            }
            if (q.size() >= max) {
                throw new IllegalStateException(mensaje);
            }
            q.addLast(ahora);
        }
    }
}
