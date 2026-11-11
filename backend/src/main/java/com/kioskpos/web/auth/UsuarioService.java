package com.kioskpos.web.auth;

import com.kioskpos.web.tenant.NegocioContext;
import java.util.List;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alta y gestión de usuarios del negocio actual (el de la sesión). Se ejecuta con
 * {@link NegocioContext} ya fijado por el filtro de JWT, así que todo pasa por RLS.
 *
 * Diferencia con el escritorio: las contraseñas y los PIN se guardan con BCrypt,
 * nunca en texto plano.
 */
@Service
public class UsuarioService {

    private final UsuarioRepository usuarioRepository;
    private final CuentaLoginRepository cuentaLoginRepository;
    private final PasswordEncoder passwordEncoder;

    public UsuarioService(UsuarioRepository usuarioRepository,
                          CuentaLoginRepository cuentaLoginRepository,
                          PasswordEncoder passwordEncoder) {
        this.usuarioRepository = usuarioRepository;
        this.cuentaLoginRepository = cuentaLoginRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /** Crea un usuario que entra con correo+contraseña (DUENO o ENCARGADO). */
    @Transactional
    public Usuario crearConCorreo(String nombreCompleto, RolUsuario rol, String email, String password) {
        if (rol != RolUsuario.DUENO && rol != RolUsuario.ENCARGADO && rol != RolUsuario.SOPORTE) {
            throw new IllegalArgumentException("Este rol no usa correo+contraseña");
        }
        exigirTexto(nombreCompleto, "El nombre completo es obligatorio");
        exigirTexto(email, "El correo es obligatorio");
        exigirTexto(password, "La contraseña es obligatoria");
        if (password.trim().length() < 6) {
            throw new IllegalArgumentException("La contraseña debe tener al menos 6 caracteres");
        }
        String correo = email.trim().toLowerCase();
        if (cuentaLoginRepository.existsByEmail(correo)) {
            throw new IllegalArgumentException("Ya existe una cuenta con el correo '" + correo + "'");
        }

        Usuario usuario = new Usuario();
        usuario.setNegocioId(NegocioContext.require());
        usuario.setNombreCompleto(nombreCompleto.trim());
        usuario.setRol(rol);
        usuario.setActivo(true);
        usuario.setEsSoporte(rol == RolUsuario.SOPORTE);
        usuario = usuarioRepository.saveAndFlush(usuario);

        CuentaLogin cuenta = new CuentaLogin();
        cuenta.setEmail(correo);
        cuenta.setPasswordHash(passwordEncoder.encode(password));
        cuenta.setNegocioId(usuario.getNegocioId());
        cuenta.setUsuarioId(usuario.getId());
        cuenta.setActivo(true);
        cuentaLoginRepository.save(cuenta);

        return usuario;
    }

    /** Crea un cajero, que entra con PIN sobre una caja registrada. */
    @Transactional
    public Usuario crearCajero(String nombreCompleto, String pin) {
        exigirTexto(nombreCompleto, "El nombre completo es obligatorio");
        exigirPin(pin);
        Usuario cajero = new Usuario();
        cajero.setNegocioId(NegocioContext.require());
        cajero.setNombreCompleto(nombreCompleto.trim());
        cajero.setRol(RolUsuario.CAJERO);
        cajero.setPinHash(passwordEncoder.encode(pin.trim()));
        cajero.setActivo(true);
        return usuarioRepository.save(cajero);
    }

    /**
     * El usuario "Soporte Técnico" (uriel) del negocio en contexto. Es VISIBLE en la
     * lista del cliente y el dueño puede desactivarlo (CLAUDE.md §4). No tiene login
     * propio: al super admin lo usa para entrar al negocio desde su panel. Se crea la
     * primera vez si no existe (y crearSiNoHay=true); si ya existe se devuelve tal cual
     * (aunque esté desactivado, para respetar que el dueño lo haya apagado).
     */
    @Transactional
    public Usuario soporteTecnico(boolean crearSiNoHay) {
        List<Usuario> existentes = usuarioRepository.findByRol(RolUsuario.SOPORTE);
        if (!existentes.isEmpty()) {
            return existentes.get(0);
        }
        if (!crearSiNoHay) {
            return null;
        }
        Usuario s = new Usuario();
        s.setNegocioId(NegocioContext.require());
        s.setNombreCompleto("Soporte Técnico");
        s.setRol(RolUsuario.SOPORTE);
        s.setEsSoporte(true);
        s.setActivo(true);
        return usuarioRepository.save(s);
    }

    @Transactional(readOnly = true)
    public List<Usuario> listar() {
        return usuarioRepository.findByActivoTrue();
    }

    /**
     * Cajeros activos del negocio de la sesión. Es @Transactional a propósito: el
     * llamador (AuthService) fija el NegocioContext ANTES de invocar este método, y
     * como es una llamada a otro bean (proxy), la transacción empieza aquí con el
     * contexto ya puesto, de modo que el TenantAwareJpaTransactionManager aplica el
     * SET LOCAL del negocio y RLS deja ver las filas. (Una consulta derivada llamada
     * en línea, sin este límite transaccional, no dispara ese SET y RLS cierra.)
     */
    @Transactional(readOnly = true)
    public List<Usuario> listarCajerosActivos() {
        return usuarioRepository.findByRolAndActivoTrue(RolUsuario.CAJERO);
    }

    /**
     * Desactiva un usuario. No permite quedarse sin ningún DUENO activo (regla
     * portada del escritorio: nunca dejar el negocio sin dueño que pueda entrar).
     */
    @Transactional
    public void desactivar(Long id) {
        Usuario usuario = usuarioRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
        if (usuario.getRol() == RolUsuario.DUENO && usuario.isActivo()) {
            long otrosDuenos = usuarioRepository.countByRolAndActivoTrue(RolUsuario.DUENO);
            if (otrosDuenos <= 1) {
                throw new IllegalStateException("No se puede desactivar al único dueño activo del negocio");
            }
        }
        usuario.setActivo(false);
        usuarioRepository.save(usuario);
    }

    private void exigirTexto(String v, String msg) {
        if (v == null || v.trim().isEmpty()) {
            throw new IllegalArgumentException(msg);
        }
    }

    private void exigirPin(String pin) {
        // PIN rápido de EXACTAMENTE 4 dígitos: la pantalla de cobro lee 4 y entra sola.
        if (pin == null || !pin.trim().matches("\\d{4}")) {
            throw new IllegalArgumentException("El PIN debe ser de 4 dígitos");
        }
    }
}
