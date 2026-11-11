package com.kioskpos.web.auth;

import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.tenant.NegocioContext;
import org.springframework.stereotype.Service;

/**
 * Alta de un negocio nuevo junto con su local "Principal" y su primer dueño. Esto es
 * una operación de super admin (el panel del Paso 4 la usará); por ahora también la
 * usan el seed de desarrollo y las pruebas.
 *
 * El negocio se crea sin contexto (la tabla negocios no tiene RLS — la gestiona el
 * super admin). Creado el negocio y conocido su id, se fija {@link NegocioContext}
 * para crear el local y el dueño, que sí están bajo RLS. No es una única transacción
 * atómica a propósito: no se puede fijar el contexto del negocio antes de que el
 * negocio exista.
 */
@Service
public class NegocioRegistroService {

    private final NegocioRepository negocioRepository;
    private final LocalRepository localRepository;
    private final UsuarioService usuarioService;

    public NegocioRegistroService(NegocioRepository negocioRepository,
                                  LocalRepository localRepository,
                                  UsuarioService usuarioService) {
        this.negocioRepository = negocioRepository;
        this.localRepository = localRepository;
        this.usuarioService = usuarioService;
    }

    /** Días de prueba gratis con los que arranca un negocio nuevo. */
    public static final int DIAS_PRUEBA = 7;

    public NegocioCreado registrarNegocioConDueno(String nombreNegocio, String nombreDueno,
                                                  String email, String password) {
        if (nombreNegocio == null || nombreNegocio.trim().isEmpty()) {
            throw new IllegalArgumentException("El nombre del negocio es obligatorio");
        }
        Negocio negocio = new Negocio();
        negocio.setNombre(nombreNegocio.trim());
        negocio.setEstado("ACTIVA");
        // Arranca con una semana de prueba: puede cobrar desde el primer día.
        negocio.setPagoHasta(com.kioskpos.web.Fechas.hoy().plusDays(DIAS_PRUEBA));
        negocio.setEnPrueba(true);
        negocio = negocioRepository.save(negocio);

        try {
            NegocioContext.set(negocio.getId());
            Local local = new Local();
            local.setNegocioId(negocio.getId());
            local.setNombre("Principal");
            local.setActivo(true);
            localRepository.save(local);

            Usuario dueno = usuarioService.crearConCorreo(
                    nombreDueno, RolUsuario.DUENO, email, password);
            return new NegocioCreado(negocio.getId(), dueno.getId());
        } finally {
            NegocioContext.clear();
        }
    }

    public record NegocioCreado(Long negocioId, Long duenoId) {
    }
}
