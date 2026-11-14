package com.kioskpos.web.auth;

import com.kioskpos.web.correo.EmailService;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.seguridad.LimitePorIp;
import com.kioskpos.web.seguridad.RecuperacionService;
import java.time.Duration;
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

    private final NegocioRegistroService negocioRegistroService;
    private final NegocioRepository negocioRepository;
    private final CuentaLoginRepository cuentaLoginRepository;
    private final EmailService emailService;
    private final AuthService authService;
    private final RecuperacionService recuperacion;
    private final boolean abierto;
    private final LimitePorIp limite;

    public RegistroPublicoService(NegocioRegistroService negocioRegistroService,
                                  NegocioRepository negocioRepository,
                                  CuentaLoginRepository cuentaLoginRepository,
                                  EmailService emailService,
                                  AuthService authService,
                                  RecuperacionService recuperacion,
                                  @Value("${kioskpos.registro.abierto:true}") boolean abierto,
                                  @Value("${kioskpos.registro.max-por-hora:5}") int maxPorHora) {
        this.negocioRegistroService = negocioRegistroService;
        this.negocioRepository = negocioRepository;
        this.cuentaLoginRepository = cuentaLoginRepository;
        this.emailService = emailService;
        this.authService = authService;
        this.recuperacion = recuperacion;
        this.abierto = abierto;
        this.limite = new LimitePorIp(maxPorHora, Duration.ofHours(1),
                "Se crearon muchas cuentas desde esta conexión. Intenta más tarde.");
    }

    public boolean abierto() {
        return abierto;
    }

    /** Sesión iniciada + código de recuperación (se muestra UNA vez en la bienvenida). */
    public record Registrado(AuthService.ResultadoLogin login, String codigoRecuperacion) {
    }

    public record DatosRegistro(String negocio, String nombre, String telefono, String email, String password) {
    }

    /** Crea negocio + dueño y devuelve la sesión ya iniciada (entra directo al sistema). */
    public Registrado registrar(DatosRegistro d, String ip) {
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
        limite.contar(ip);

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
        String codigo = cuentaLoginRepository.findByEmail(correo).map(recuperacion::generar).orElse(null);
        return new Registrado(authService.loginDueno(correo, clave), codigo);
    }

    private static String limpio(String s, String error, int max) {
        String t = s == null ? "" : s.trim().replaceAll("\\s+", " ");
        if (t.isEmpty()) {
            throw new IllegalArgumentException(error);
        }
        return t.length() > max ? t.substring(0, max) : t;
    }
}
