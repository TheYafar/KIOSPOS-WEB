package com.kioskpos.web.seguridad;

import com.kioskpos.web.auth.AuthException;
import com.kioskpos.web.auth.CuentaLogin;
import com.kioskpos.web.auth.CuentaLoginRepository;
import com.kioskpos.web.negocio.NegocioRepository;
import java.security.SecureRandom;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Código de recuperación de la cuenta (como el de un banco): 12 caracteres fáciles de copiar
 * (sin 0/O/1/I/L), en grupos XXXX-XXXX-XXXX. Con el correo + el código el dueño pone una clave
 * nueva SIN correo electrónico. Solo se guarda su hash (BCrypt); al usarlo se cambia por uno
 * nuevo (un solo uso). Los intentos fallidos se limitan igual que el login.
 */
@Service
public class RecuperacionService {

    static final String ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RND = new SecureRandom();

    private final CuentaLoginRepository cuentas;
    private final NegocioRepository negocios;
    private final PasswordEncoder encoder;
    private final IntentosLoginService intentos;

    public RecuperacionService(CuentaLoginRepository cuentas, NegocioRepository negocios,
                               PasswordEncoder encoder, IntentosLoginService intentos) {
        this.cuentas = cuentas;
        this.negocios = negocios;
        this.encoder = encoder;
        this.intentos = intentos;
    }

    /** Código nuevo para la cuenta (reemplaza al anterior). Se muestra UNA vez. */
    @Transactional
    public String generar(CuentaLogin cuenta) {
        String codigo = nuevoCodigo();
        cuenta.setRecuperacionHash(encoder.encode(normalizar(codigo)));
        cuentas.save(cuenta);
        return codigo;
    }

    /** Para el usuario de la sesión (dueño/encargado). */
    @Transactional
    public String generarParaUsuario(Long usuarioId) {
        CuentaLogin c = cuentaDe(usuarioId);
        if (negocios.findById(c.getNegocioId()).map(n -> n.isEsDemo()).orElse(false)) {
            throw new IllegalStateException("En la demo no hace falta código de recuperación.");
        }
        return generar(c);
    }

    @Transactional(readOnly = true)
    public boolean tiene(Long usuarioId) {
        return cuentas.findByUsuarioId(usuarioId).map(c -> c.getRecuperacionHash() != null).orElse(false);
    }

    public record Recuperada(String email, String codigoNuevo) {
    }

    /** Pone la clave nueva con correo + código. Devuelve un código NUEVO (el usado ya no sirve). */
    @Transactional
    public Recuperada recuperar(String email, String codigo, String claveNueva) {
        String correo = email == null ? "" : email.trim().toLowerCase();
        if (claveNueva == null || claveNueva.length() < 8) {
            throw new IllegalArgumentException("La contraseña nueva debe tener al menos 8 caracteres");
        }
        String clave = "rec:" + correo;
        intentos.verificar(clave);
        CuentaLogin c = cuentas.findByEmail(correo).orElse(null);
        boolean ok = c != null && c.isActivo() && c.getRecuperacionHash() != null
                && encoder.matches(normalizar(codigo), c.getRecuperacionHash());
        if (!ok) {
            int quedan = intentos.fallo(clave);
            throw new AuthException("Correo o código incorrectos." + IntentosLoginService.quedan(quedan));
        }
        intentos.exito(clave);
        intentos.exito(IntentosLoginService.dueno(correo)); // desbloquea el login si estaba bloqueado
        c.setPasswordHash(encoder.encode(claveNueva));
        String nuevo = generar(c);
        return new Recuperada(correo, nuevo);
    }

    private CuentaLogin cuentaDe(Long usuarioId) {
        return cuentas.findByUsuarioId(usuarioId)
                .orElseThrow(() -> new IllegalArgumentException("Tu usuario no entra con correo y contraseña"));
    }

    static String nuevoCodigo() {
        StringBuilder sb = new StringBuilder(14);
        for (int i = 0; i < 12; i++) {
            if (i > 0 && i % 4 == 0) {
                sb.append('-');
            }
            sb.append(ALFABETO.charAt(RND.nextInt(ALFABETO.length())));
        }
        return sb.toString();
    }

    /** Mayúsculas y sin guiones ni espacios; confunde-proof: O→0 no aplica (no se usan). */
    static String normalizar(String codigo) {
        return codigo == null ? "" : codigo.toUpperCase().replaceAll("[^A-Z0-9]", "");
    }
}
