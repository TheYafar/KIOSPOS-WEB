package com.kioskpos.web.auth;

import com.kioskpos.web.correo.EmailService;
import com.kioskpos.web.negocio.NegocioRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Registro por cuenta propia: un dueño de bodega crea su negocio y su cuenta desde la
 * pantalla de entrada, sin pasar por el super admin. Arranca con la prueba gratis
 * ({@link NegocioRegistroService#DIAS_PRUEBA} días), plan Bodega y 1 caja.
 *
 * Protecciones: se puede apagar ({@code kioskpos.registro.abierto}), valida los datos
 * ANTES de crear nada (así un correo repetido no deja un negocio huérfano) y limita
 * cuántos negocios se crean por IP en una hora.
 */
@Service
public class RegistroPublicoService {

    private static final Pattern CORREO = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
    private static final Duration VENTANA = Duration.ofHours(1);

    private final NegocioRegistroService negocioRegistroService;
    private final NegocioRepository negocioRepository;
    private final CuentaLoginRepository cuentaLoginRepository;
    private final EmailService emailService;
    private final AuthService authService;
    private final boolean abierto;
    private final int maxPorHora;
    private final Map<String, Deque<Instant>> porIp = new ConcurrentHashMap<>();

    public RegistroPublicoService(NegocioRegistroService negocioRegistroService,
                                  NegocioRepository negocioRepository,
                                  CuentaLoginRepository cuentaLoginRepository,
                                  EmailService emailService,
                                  AuthService authService,
                                  @Value("${kioskpos.registro.abierto:true}") boolean abierto,
                                  @Value("${kioskpos.registro.max-por-hora:5}") int maxPorHora) {
        this.negocioRegistroService = negocioRegistroService;
        this.negocioRepository = negocioRepository;
        this.cuentaLoginRepository = cuentaLoginRepository;
        this.emailService = emailService;
        this.authService = authService;
        this.abierto = abierto;
        this.maxPorHora = maxPorHora;
    }

    public record DatosRegistro(String negocio, String nombre, String telefono, String email, String password) {
    }

    /** Crea negocio + dueño y devuelve la sesión ya iniciada (entra directo al sistema). */
    public AuthService.ResultadoLogin registrar(DatosRegistro d, String ip) {
        if (!abierto) {
            throw new IllegalStateException("El registro está cerrado por ahora. Escríbenos por WhatsApp y te creamos la cuenta.");
        }
        String negocio = limpio(d.negocio(), "Escribe el nombre de tu bodega o negocio", 120);
        String nombre = limpio(d.nombre(), "Escribe tu nombre", 120);
        String correo = d.email() == null ? "" : d.email().trim().toLowerCase();
        if (!CORREO.matcher(correo).matches() || correo.length() > 160) {
            throw new IllegalArgumentException("Escribe un correo válido");
        }
        String clave = d.password() == null ? "" : d.password();
        if (clave.length() < 8) {
            throw new IllegalArgumentException("La contraseña debe tener al menos 8 caracteres");
        }
        if (clave.length() > 100) {
            throw new IllegalArgumentException("La contraseña es demasiado larga");
        }
        String telefono = d.telefono() == null || d.telefono().isBlank() ? null
                : d.telefono().replaceAll("[^0-9+\\- ]", "").trim();
        if (telefono != null && telefono.length() > 30) {
            telefono = telefono.substring(0, 30);
        }
        // Antes de crear nada: un correo ya usado no debe dejar un negocio a medias.
        if (cuentaLoginRepository.existsByEmail(correo)) {
            throw new IllegalArgumentException("Ya hay una cuenta con ese correo. Entra con tu contraseña o usa \"¿Olvidaste tu contraseña?\".");
        }
        controlarIp(ip);

        NegocioRegistroService.NegocioCreado creado =
                negocioRegistroService.registrarNegocioConDueno(negocio, nombre, correo, clave);
        final String tel = telefono;
        negocioRepository.findById(creado.negocioId()).ifPresent(n -> {
            n.setTelefono(tel);
            n.setCajasContratadas(1);
            n.setPlan("BASICO");
            negocioRepository.save(n);
        });
        emailService.bienvenida(correo, nombre, negocio); // async, no rompe el alta si falla
        return authService.loginDueno(correo, clave);
    }

    /** Máximo N negocios nuevos por IP por hora (frena altas en masa). */
    private void controlarIp(String ip) {
        String clave = ip == null || ip.isBlank() ? "?" : ip;
        Instant ahora = Instant.now();
        Deque<Instant> q = porIp.computeIfAbsent(clave, k -> new ArrayDeque<>());
        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst().isBefore(ahora.minus(VENTANA))) {
                q.pollFirst();
            }
            if (q.size() >= maxPorHora) {
                throw new IllegalStateException("Se crearon muchas cuentas desde esta conexión. Intenta más tarde.");
            }
            q.addLast(ahora);
        }
    }

    private static String limpio(String s, String error, int max) {
        String t = s == null ? "" : s.trim().replaceAll("\\s+", " ");
        if (t.isEmpty()) {
            throw new IllegalArgumentException(error);
        }
        return t.length() > max ? t.substring(0, max) : t;
    }
}
