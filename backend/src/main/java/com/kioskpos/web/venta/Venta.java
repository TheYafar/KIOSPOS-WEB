package com.kioskpos.web.venta;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "ventas")
@Getter
@Setter
@NoArgsConstructor
public class Venta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "negocio_id", nullable = false)
    private Long negocioId;

    @Column(name = "caja_id", nullable = false)
    private Long cajaId;

    @Column(name = "usuario_id", nullable = false)
    private Long usuarioId;

    /** Turno (sesión de caja) al que pertenece la venta; null si se cobró sin turno abierto. */
    @Column(name = "turno_id")
    private Long turnoId;

    /** UUID del cliente para deduplicar reenvíos de la cola offline (idempotencia). */
    /** Cliente al que se le fió (parte o todo), si aplica. */
    @Column(name = "cliente_id")
    private Long clienteId;

    @Column(name = "codigo_unico", length = 64)
    private String codigoUnico;

    @Column(name = "numero_factura", nullable = false)
    private Integer numeroFactura;

    @Column(name = "fecha_hora", nullable = false)
    private Instant fechaHora = Instant.now();

    @Column(name = "tasa_bcv", nullable = false, precision = 14, scale = 4)
    private BigDecimal tasaBcv;

    @Column(name = "total_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalUsd;

    @Column(name = "total_bs", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalBs;

    @Column(name = "vuelto_usd", nullable = false, precision = 12, scale = 2)
    private BigDecimal vueltoUsd = BigDecimal.ZERO;

    @Column(name = "vuelto_bs", nullable = false, precision = 14, scale = 2)
    private BigDecimal vueltoBs = BigDecimal.ZERO;

    @Column(nullable = false, length = 20)
    private String estado = "COMPLETADA";

    @OneToMany(mappedBy = "venta", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<DetalleVenta> detalles = new ArrayList<>();

    @OneToMany(mappedBy = "venta", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<PagoVenta> pagos = new ArrayList<>();

    public void addDetalle(DetalleVenta d) {
        d.setVenta(this);
        d.setNegocioId(this.negocioId);
        detalles.add(d);
    }

    public void addPago(PagoVenta p) {
        p.setVenta(this);
        p.setNegocioId(this.negocioId);
        pagos.add(p);
    }
}
