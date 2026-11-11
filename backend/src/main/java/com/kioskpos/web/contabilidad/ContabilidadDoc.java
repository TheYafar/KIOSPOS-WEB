package com.kioskpos.web.contabilidad;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Documento JSON de la contabilidad "a mano" del dueño (libreta u hojas). */
@Entity
@Table(name = "contabilidad_docs")
@Getter
@Setter
@NoArgsConstructor
public class ContabilidadDoc {

    @EmbeddedId
    private Clave id;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String contenido;

    @Column(nullable = false)
    private long version = 1;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @EqualsAndHashCode
    public static class Clave implements Serializable {
        @Column(name = "negocio_id", nullable = false)
        private Long negocioId;

        @Column(nullable = false, length = 20)
        private String clave;

        public Clave(Long negocioId, String clave) {
            this.negocioId = negocioId;
            this.clave = clave;
        }
    }
}
