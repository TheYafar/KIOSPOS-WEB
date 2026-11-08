package com.kioskpos.web.tasa;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Tasa BCV del día. El servidor la trae solo de una API pública del dólar oficial,
 * la redondea HACIA ARRIBA al bolívar entero (ej. 896,12 -> 897) y la cachea. La caja
 * la consume por GET /api/tasa, así nadie tiene que escribirla a mano.
 *
 * - Sin dependencias extra: HttpClient del JDK + Jackson (ya viene con spring-web).
 * - A prueba de fallos: si la API no responde, se mantiene el último valor conocido.
 * - Refresco perezoso con TTL: se actualiza cuando pasó el TTL y alguien pide la tasa
 *   (la caja consulta periódicamente), sin depender de @Scheduled.
 */
@Service
public class TasaService {

    private static final Logger log = LoggerFactory.getLogger(TasaService.class);

    private final String url;
    private final Duration ttl;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final ObjectMapper json = new ObjectMapper();
    private final AtomicBoolean refrescando = new AtomicBoolean(false);

    private volatile Integer tasaBs;        // redondeada hacia arriba (null hasta el primer éxito)
    private volatile Instant actualizado;   // cuándo la trajimos
    private volatile String fechaFuente;    // fechaActualizacion que reporta el BCV

    public TasaService(
            @Value("${kioskpos.tasa.url:https://ve.dolarapi.com/v1/dolares/oficial}") String url,
            @Value("${kioskpos.tasa.ttl-horas:3}") long ttlHoras) {
        this.url = url;
        this.ttl = Duration.ofHours(Math.max(1, ttlHoras));
    }

    /** Devuelve la tasa vigente (refresca si está vencida o nunca se trajo). */
    public Map<String, Object> actual() {
        if (necesitaRefresco()) {
            refrescar();
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("bs", tasaBs);
        m.put("fuente", "BCV");
        m.put("fechaFuente", fechaFuente);
        m.put("actualizado", actualizado == null ? null : actualizado.toString());
        return m;
    }

    private boolean necesitaRefresco() {
        return tasaBs == null || actualizado == null
                || Duration.between(actualizado, Instant.now()).compareTo(ttl) >= 0;
    }

    /** Trae la tasa de la API y la redondea hacia arriba. No lanza: ante fallo, conserva la última. */
    public void refrescar() {
        if (!refrescando.compareAndSet(false, true)) {
            return; // ya hay un refresco en curso
        }
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("Accept", "application/json")
                    .GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() / 100 != 2) {
                log.warn("Tasa BCV: respuesta {} de {}", resp.statusCode(), url);
                return;
            }
            JsonNode n = json.readTree(resp.body());
            double promedio = n.path("promedio").asDouble(0);
            if (promedio <= 0) {
                log.warn("Tasa BCV: 'promedio' inválido en la respuesta");
                return;
            }
            this.tasaBs = (int) Math.ceil(promedio);
            this.actualizado = Instant.now();
            this.fechaFuente = n.path("fechaActualizacion").asText(null);
            log.info("Tasa BCV actualizada: {} Bs (promedio {})", tasaBs, promedio);
        } catch (Exception e) {
            log.warn("Tasa BCV: no se pudo actualizar ({}), se mantiene la última", e.toString());
        } finally {
            refrescando.set(false);
        }
    }
}
