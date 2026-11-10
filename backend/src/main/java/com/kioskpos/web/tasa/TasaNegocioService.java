package com.kioskpos.web.tasa;

import com.kioskpos.web.negocio.Negocio;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.stereotype.Service;

/**
 * Tasa con la que COBRA un negocio, calculada en el servidor (no en la caja):
 *  - BCV:    la BCV del día (ya redondeada hacia arriba al Bs).
 *  - AJUSTE: BCV + aumento (% o Bs fijos), redondeada hacia arriba al Bs.
 *  - MANUAL: una tasa fija que pone el dueño.
 * Devuelve null si depende de la BCV y no se ha podido traer (la caja usa la suya).
 */
@Service
public class TasaNegocioService {

    /** Margen aceptado entre la tasa que usó la caja y la del negocio (ventas sin internet). */
    public static final BigDecimal TOLERANCIA_PCT = new BigDecimal("3");

    private final TasaService tasaService;

    public TasaNegocioService(TasaService tasaService) {
        this.tasaService = tasaService;
    }

    public BigDecimal efectiva(Negocio n) {
        boolean fija = "MANUAL".equals(n.getTasaModo()) && n.getTasaManual() != null && n.getTasaManual().signum() > 0;
        return calcular(n.getTasaModo(), n.getTasaAjusteTipo(), n.getTasaAjuste(), n.getTasaManual(),
                fija ? null : tasaService.bcv());
    }

    /** Cálculo puro (para pruebas): mismo criterio que la pantalla de Configuración. */
    public static BigDecimal calcular(String modo, String ajusteTipo, BigDecimal ajuste, BigDecimal manual, Integer bcv) {
        if ("MANUAL".equals(modo) && manual != null && manual.signum() > 0) {
            return manual.setScale(2, RoundingMode.HALF_UP);
        }
        // MANUAL sin tasa escrita todavía: se cobra a la BCV (igual que la pantalla).
        if (bcv == null || bcv <= 0) {
            return null;
        }
        BigDecimal base = BigDecimal.valueOf(bcv);
        if ("AJUSTE".equals(modo) && ajuste != null && ajuste.signum() > 0) {
            BigDecimal extra = "BS".equals(ajusteTipo) ? ajuste : base.multiply(ajuste).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP);
            return base.add(extra).setScale(0, RoundingMode.CEILING).setScale(2, RoundingMode.UNNECESSARY);
        }
        return base.setScale(2, RoundingMode.UNNECESSARY);
    }

    /** ¿La tasa que mandó la caja está dentro del margen de la del negocio? */
    public static boolean dentroDelMargen(BigDecimal usada, BigDecimal delNegocio) {
        if (delNegocio == null || delNegocio.signum() <= 0) {
            return true; // no hay con qué comparar (BCV caída): se acepta la de la caja
        }
        BigDecimal dif = usada.subtract(delNegocio).abs()
                .multiply(BigDecimal.valueOf(100)).divide(delNegocio, 4, RoundingMode.HALF_UP);
        return dif.compareTo(TOLERANCIA_PCT) <= 0;
    }
}
