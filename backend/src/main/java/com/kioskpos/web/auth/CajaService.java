package com.kioskpos.web.auth;

import com.kioskpos.web.tenant.NegocioContext;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registro y autorización de cajas del negocio actual. Al registrar una caja se le
 * entrega UNA sola vez su token en claro, que el navegador de la caja guarda
 * (IndexedDB) para luego iniciar sesión de cajero. El servidor solo guarda el hash.
 */
@Service
public class CajaService {

    private final CajaRepository cajaRepository;
    private final CajaTokenRepository cajaTokenRepository;
    private final LocalRepository localRepository;
    private final com.kioskpos.web.negocio.NegocioRepository negocioRepository;

    public CajaService(CajaRepository cajaRepository,
                       CajaTokenRepository cajaTokenRepository,
                       LocalRepository localRepository,
                       com.kioskpos.web.negocio.NegocioRepository negocioRepository) {
        this.cajaRepository = cajaRepository;
        this.cajaTokenRepository = cajaTokenRepository;
        this.localRepository = localRepository;
        this.negocioRepository = negocioRepository;
    }

    @Transactional
    public CajaRegistrada registrar(String nombre, Long localId) {
        if (nombre == null || nombre.trim().isEmpty()) {
            throw new IllegalArgumentException("El nombre de la caja es obligatorio");
        }
        Long negocioId = NegocioContext.require();
        // El plan incluye un número de cajas: no se pueden registrar más de las contratadas.
        int contratadas = negocioRepository.findById(negocioId).map(n -> n.getCajasContratadas() == null ? 1 : n.getCajasContratadas()).orElse(1);
        long activas = cajaRepository.findByActivaTrue().size();
        if (activas >= contratadas) {
            throw new IllegalStateException("Tu plan incluye " + contratadas + (contratadas == 1 ? " caja" : " cajas")
                    + " y ya las tienes. Para agregar otra, pide ampliar el plan (o desactiva una que no uses).");
        }
        Long localDestino = localId != null ? localId : localPorDefecto(negocioId);

        Caja caja = new Caja();
        caja.setNegocioId(negocioId);
        caja.setLocalId(localDestino);
        caja.setNombre(nombre.trim());
        caja.setAutorizada(true);
        caja.setActiva(true);
        caja = cajaRepository.saveAndFlush(caja);

        String tokenClaro = Secretos.nuevoTokenCaja();
        CajaToken token = new CajaToken();
        token.setTokenHash(Secretos.sha256Hex(tokenClaro));
        token.setCajaId(caja.getId());
        token.setNegocioId(negocioId);
        cajaTokenRepository.save(token);

        return new CajaRegistrada(caja, tokenClaro);
    }

    @Transactional(readOnly = true)
    public List<Caja> listar() {
        return cajaRepository.findByActivaTrue();
    }

    /** Cambia el nombre de una caja. */
    @Transactional
    public Caja renombrar(Long id, String nombre) {
        if (nombre == null || nombre.trim().isEmpty()) {
            throw new IllegalArgumentException("El nombre de la caja es obligatorio");
        }
        Caja caja = cajaRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Caja no encontrada"));
        caja.setNombre(nombre.trim());
        return cajaRepository.save(caja);
    }

    /**
     * Borra (desactiva) una caja y elimina su token: deja de contar para el plan y el
     * equipo que la tenía configurada ya no puede cobrar (hay que registrarla de nuevo).
     */
    @Transactional
    public void borrar(Long id) {
        Caja caja = cajaRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Caja no encontrada"));
        caja.setActiva(false);
        cajaRepository.save(caja);
        cajaTokenRepository.deleteByCajaId(id);
    }

    private Long localPorDefecto(Long negocioId) {
        return localRepository.findByActivoTrue().stream()
                .findFirst()
                .map(Local::getId)
                .orElseGet(() -> {
                    Local local = new Local();
                    local.setNegocioId(negocioId);
                    local.setNombre("Principal");
                    local.setActivo(true);
                    return localRepository.save(local).getId();
                });
    }

    public record CajaRegistrada(Caja caja, String tokenClaro) {
    }
}
