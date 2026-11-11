package com.kioskpos.web.auth;

import com.kioskpos.web.auth.security.JwtService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.seguridad.IntentosLoginService;
import com.kioskpos.web.tenant.NegocioContext;
import java.time.Instant;
import java.util.List;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Autenticación de los dos caminos de entrada:
 *  - Dueño/encargado: correo + contraseña (desde cualquier lado).
 *  - Cajero: PIN sobre una caja registrada.
 *
 * Ambos arrancan resolviendo el negocio en una tabla de DIRECTORIO sin RLS
 * (cuentas_login / caja_tokens), porque todavía no hay sesión. Resuelto el negocio,
 * se fija {@link NegocioContext} y el resto de accesos ya pasan por Row Level
 * Security. El contexto se limpia siempre al terminar.
 *
 * No es @Transactional a nivel de método a propósito: cada llamada al repositorio
 * abre su propia transacción, y el gestor de transacciones lee NegocioContext al
 * iniciar cada una — así la primera búsqueda (directorio, sin negocio) ocurre antes
 * de fijar el contexto, y las siguientes (datos, con RLS) ya lo tienen fijado.
 */
@Service
public class AuthService {

    private final CuentaLoginRepository cuentaLoginRepository;
    private final CajaTokenRepository cajaTokenRepository;
    private final UsuarioRepository usuarioRepository;
    private final CajaRepository cajaRepository;
    private final UsuarioService usuarioService;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final IntentosLoginService intentos;

    public AuthService(CuentaLoginRepository cuentaLoginRepository,
                       CajaTokenRepository cajaTokenRepository,
                       UsuarioRepository usuarioRepository,
                       CajaRepository cajaRepository,
                       UsuarioService usuarioService,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       IntentosLoginService intentos) {
        this.cuentaLoginRepository = cuentaLoginRepository;
        this.cajaTokenRepository = cajaTokenRepository;
        this.usuarioRepository = usuarioRepository;
        this.cajaRepository = cajaRepository;
        this.usuarioService = usuarioService;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.intentos = intentos;
    }

    public ResultadoLogin loginDueno(String email, String password) {
        String correo = email == null ? "" : email.trim().toLowerCase();
        String clave = IntentosLoginService.dueno(correo);
        intentos.verificar(clave);
        CuentaLogin cuenta = cuentaLoginRepository.findByEmail(correo).orElse(null);
        // Mensaje genérico e igual trabajo de verificación tanto si el correo existe
        // como si no, para no revelar qué correos están registrados.
        boolean ok = cuenta != null
                && cuenta.isActivo()
                && passwordEncoder.matches(password == null ? "" : password, cuenta.getPasswordHash());
        if (!ok) {
            int quedan = intentos.fallo(clave);
            throw new AuthException("Correo o contraseña incorrectos." + IntentosLoginService.quedan(quedan));
        }
        intentos.exito(clave);
        try {
            NegocioContext.set(cuenta.getNegocioId());
            Usuario usuario = usuarioRepository.findById(cuenta.getUsuarioId())
                    .filter(Usuario::isActivo)
                    .orElseThrow(() -> new AuthException("La cuenta no está activa"));
            KioskPrincipal p = new KioskPrincipal(
                    usuario.getId(), usuario.getNegocioId(), usuario.getRol(), null);
            return new ResultadoLogin(jwtService.emitir(p), usuario.getId(),
                    usuario.getNombreCompleto(), usuario.getRol(), usuario.getNegocioId(), null);
        } finally {
            NegocioContext.clear();
        }
    }

    public ResultadoLogin loginCajero(String cajaToken, Long usuarioId, String pin) {
        if (cajaToken == null || usuarioId == null) {
            throw new AuthException("Datos de inicio de sesión incompletos");
        }
        CajaToken ct = cajaTokenRepository.findByTokenHash(Secretos.sha256Hex(cajaToken))
                .orElseThrow(() -> new AuthException("Caja no reconocida"));
        try {
            NegocioContext.set(ct.getNegocioId());
            Caja caja = cajaRepository.findById(ct.getCajaId())
                    .orElseThrow(() -> new AuthException("Caja no reconocida"));
            if (!caja.isActiva() || !caja.isAutorizada()) {
                throw new AuthException("Esta caja no está autorizada para cobrar");
            }
            String clave = IntentosLoginService.cajero(caja.getId(), usuarioId);
            intentos.verificar(clave);
            Usuario cajero = usuarioRepository.findById(usuarioId).orElse(null);
            boolean ok = cajero != null
                    && cajero.isActivo()
                    && cajero.getRol() == RolUsuario.CAJERO
                    && cajero.getPinHash() != null
                    && passwordEncoder.matches(pin == null ? "" : pin, cajero.getPinHash());
            if (!ok) {
                int quedan = intentos.fallo(clave);
                throw new AuthException("PIN incorrecto." + IntentosLoginService.quedan(quedan));
            }
            intentos.exito(clave);
            caja.setLastSeen(Instant.now());
            cajaRepository.save(caja);
            KioskPrincipal p = new KioskPrincipal(
                    cajero.getId(), cajero.getNegocioId(), RolUsuario.CAJERO, caja.getId());
            return new ResultadoLogin(jwtService.emitir(p), cajero.getId(),
                    cajero.getNombreCompleto(), RolUsuario.CAJERO, cajero.getNegocioId(), caja.getId());
        } finally {
            NegocioContext.clear();
        }
    }

    /**
     * El super admin entra a un negocio como SOPORTE (Opción A). No pide clave: lo
     * autoriza su propia sesión de super admin (el endpoint que llama esto está bajo
     * /api/admin/**). Emite un token de SOPORTE con el negocio en contexto, para que
     * RLS lo acote a ese negocio. Como SOPORTE solo puede LEER (SecurityConfig deja
     * las escrituras sensibles a DUENO/ENCARGADO), es acceso de solo-consulta.
     */
    public ResultadoLogin entrarComoSoporte(Long negocioId) {
        if (negocioId == null) {
            throw new AuthException("Negocio no indicado");
        }
        try {
            NegocioContext.set(negocioId);
            Usuario soporte = usuarioService.soporteTecnico(true);
            if (!soporte.isActivo()) {
                throw new AuthException("El soporte técnico está desactivado en este negocio");
            }
            KioskPrincipal p = new KioskPrincipal(
                    soporte.getId(), negocioId, RolUsuario.SOPORTE, null);
            return new ResultadoLogin(jwtService.emitir(p), soporte.getId(),
                    soporte.getNombreCompleto(), RolUsuario.SOPORTE, negocioId, null);
        } finally {
            NegocioContext.clear();
        }
    }

    /** Lista de cajeros activos para la pantalla de bloqueo de una caja (sin datos sensibles). */
    public List<CajeroResumen> listarCajerosDeCaja(String cajaToken) {
        if (cajaToken == null) {
            throw new AuthException("Caja no reconocida");
        }
        CajaToken ct = cajaTokenRepository.findByTokenHash(Secretos.sha256Hex(cajaToken))
                .orElseThrow(() -> new AuthException("Caja no reconocida"));
        try {
            NegocioContext.set(ct.getNegocioId());
            // Vía un método @Transactional de otro bean para que el SET LOCAL del
            // negocio se aplique (ver UsuarioService.listarCajerosActivos).
            return usuarioService.listarCajerosActivos().stream()
                    .map(u -> new CajeroResumen(u.getId(), u.getNombreCompleto()))
                    .toList();
        } finally {
            NegocioContext.clear();
        }
    }

    public record ResultadoLogin(String token, Long usuarioId, String nombreCompleto,
                                 RolUsuario rol, Long negocioId, Long cajaId) {
    }

    public record CajeroResumen(Long id, String nombre) {
    }
}
