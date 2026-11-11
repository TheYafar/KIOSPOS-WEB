package com.kioskpos.web.contabilidad;

import com.kioskpos.web.tenant.NegocioContext;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Guarda la libreta y las hojas que el dueño lleva a mano. Control optimista: quien guarda
 * manda la versión que tenía; si otro equipo guardó antes, se rechaza (Conflicto) y el
 * equipo toma lo del servidor.
 */
@Service
public class ContabilidadService {

    public static final Set<String> CLAVES = Set.of("libro", "hojas");
    /** Tope de tamaño por documento (≈1 MB de texto). */
    public static final int MAX_CHARS = 1_000_000;

    private final ContabilidadDocRepository repo;

    public ContabilidadService(ContabilidadDocRepository repo) {
        this.repo = repo;
    }

    public record Doc(String clave, String contenido, long version, Instant updatedAt) {
    }

    /** Otro equipo guardó una versión más nueva: se devuelve para que el equipo la tome. */
    public static class Conflicto extends RuntimeException {
        private final transient Doc actual;

        public Conflicto(Doc actual) {
            super("Otro equipo guardó cambios más nuevos");
            this.actual = actual;
        }

        public Doc actual() {
            return actual;
        }
    }

    @Transactional(readOnly = true)
    public Optional<Doc> leer(String clave) {
        validar(clave);
        return repo.findById(new ContabilidadDoc.Clave(NegocioContext.require(), clave)).map(ContabilidadService::vista);
    }

    /**
     * Guarda el documento. versionBase = la versión que el equipo leyó (0 si nunca hubo).
     * Si no coincide con la del servidor, lanza {@link Conflicto} sin guardar.
     */
    @Transactional
    public Doc guardar(String clave, String contenido, long versionBase) {
        validar(clave);
        if (contenido == null || contenido.isBlank()) {
            throw new IllegalArgumentException("No hay nada que guardar");
        }
        if (contenido.length() > MAX_CHARS) {
            throw new IllegalArgumentException("Es demasiado grande para guardar (máx. 1 MB). Borra hojas viejas o expórtalas.");
        }
        Long negocioId = NegocioContext.require();
        var id = new ContabilidadDoc.Clave(negocioId, clave);
        ContabilidadDoc doc = repo.findWithLockById(id).orElse(null);
        if (doc == null) {
            if (versionBase != 0) {
                throw new Conflicto(null);
            }
            doc = new ContabilidadDoc();
            doc.setId(id);
            doc.setVersion(1);
        } else {
            if (doc.getVersion() != versionBase) {
                throw new Conflicto(vista(doc));
            }
            doc.setVersion(doc.getVersion() + 1);
        }
        doc.setContenido(contenido);
        doc.setUpdatedAt(Instant.now());
        return vista(repo.saveAndFlush(doc));
    }

    private static void validar(String clave) {
        if (!CLAVES.contains(clave)) {
            throw new IllegalArgumentException("Documento inválido");
        }
    }

    private static Doc vista(ContabilidadDoc d) {
        return new Doc(d.getId().getClave(), d.getContenido(), d.getVersion(), d.getUpdatedAt());
    }
}
