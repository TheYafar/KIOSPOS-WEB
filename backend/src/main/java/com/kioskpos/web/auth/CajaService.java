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

    public CajaService(CajaRepository cajaRepository,
                       CajaTokenRepository cajaTokenRepository,
                       LocalRepository localRepository) {
        this.cajaRepository = cajaRepository;
        this.cajaTokenRepository = cajaTokenRepository;
        this.localRepository = localRepository;
    }

    @Transactional
    public CajaRegistrada registrar(String nombre, Long localId) {
        if (nombre == null || nombre.trim().isEmpty()) {
            throw new IllegalArgumentException("El nombre de la caja es obligatorio");
        }
        Long negocioId = NegocioContext.require();
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
