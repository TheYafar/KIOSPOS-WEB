package com.kioskpos.web.suscripcion;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Foto calculada del estado de suscripción de un negocio (contra el reloj del
 * servidor). estadoEfectivo es lo que ve el super admin; puedeCobrar es lo que
 * autoriza (o no) a renovar el permiso de la caja.
 */
public record SituacionNegocio(
        Long negocioId,
        String nombre,
        String plan,
        String estadoEfectivo,   // ACTIVA | AVISO | SUSPENDIDA
        boolean puedeCobrar,
        boolean soloConsulta,
        LocalDate pagoHasta,
        int diasVencido,
        int mesesPendientes,
        BigDecimal deuda,
        String mensaje) {
}
