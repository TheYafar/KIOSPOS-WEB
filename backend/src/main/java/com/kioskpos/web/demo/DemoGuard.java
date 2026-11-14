package com.kioskpos.web.demo;

import com.kioskpos.web.negocio.NegocioRepository;
import org.springframework.stereotype.Component;

/** Bloquea en las bodegas de DEMO lo que no tiene sentido (o se prestaría a abuso). */
@Component
public class DemoGuard {

    private final NegocioRepository negocios;

    public DemoGuard(NegocioRepository negocios) {
        this.negocios = negocios;
    }

    public boolean esDemo(Long negocioId) {
        return negocioId != null && negocios.findById(negocioId).map(n -> n.isEsDemo()).orElse(false);
    }

    public void exigirNoDemo(Long negocioId, String accion) {
        if (esDemo(negocioId)) {
            throw new IllegalStateException("En la demo no se puede " + accion + ". Crea tu cuenta gratis para hacerlo.");
        }
    }
}
