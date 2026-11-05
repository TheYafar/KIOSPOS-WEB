package com.kioskpos.web.contabilidad;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Ajustes del modo automático de un negocio. Hoy solo el porcentaje de reparto del
 * sobrante hacia "mercancía" (el resto va a "tu bolsillo"). Una fila por negocio;
 * negocio_id es la PK y además la clave de RLS. Si no hay fila, el servicio asume
 * el default (40%).
 */
@Entity
@Table(name = "conta_config")
@Getter
@Setter
@NoArgsConstructor
public class ContaConfig {

    @Id
    @Column(name = "negocio_id")
    private Long negocioId;

    @Column(name = "reparto_mercancia_pct", nullable = false, precision = 5, scale = 2)
    private BigDecimal repartoMercanciaPct = new BigDecimal("40.00");
}
