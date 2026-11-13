package com.kioskpos.web.compra;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Foto de la factura del proveedor (imagen en base64), digitalizada y guardada con la compra. */
@Entity
@Table(name = "compra_fotos")
@Getter
@Setter
@NoArgsConstructor
public class CompraFoto {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "compra_id", nullable = false)
    private Long compraId;

    @Column(nullable = false, length = 40)
    private String mime;

    @Column(nullable = false, columnDefinition = "text")
    private String datos;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
