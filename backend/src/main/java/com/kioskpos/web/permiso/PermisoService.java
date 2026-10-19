package com.kioskpos.web.permiso;

import com.kioskpos.web.auth.security.JwtService;
import com.kioskpos.web.suscripcion.SituacionNegocio;
import com.kioskpos.web.suscripcion.SuscripcionService;
import org.springframework.stereotype.Service;

/**
 * El kill-switch del negocio: entrega a una caja un permiso corto y firmado para
 * cobrar, SOLO si el negocio está al día. La caja lo renueva cada pocos minutos; si
 * el negocio se vence o se suspende, la renovación se niega y, al expirar el permiso
 * actual, la caja queda en modo solo consulta.
 */
@Service
public class PermisoService {

    private final SuscripcionService suscripcionService;
    private final JwtService jwtService;

    public PermisoService(SuscripcionService suscripcionService, JwtService jwtService) {
        this.suscripcionService = suscripcionService;
        this.jwtService = jwtService;
    }

    public PermisoEmitido renovar(Long negocioId, Long cajaId) {
        SituacionNegocio sit = suscripcionService.situacion(negocioId);
        if (!sit.puedeCobrar()) {
            throw new PermisoDenegadoException(sit.mensaje());
        }
        String token = jwtService.emitirPermiso(negocioId, cajaId);
        return new PermisoEmitido(token, jwtService.permisoLeaseMinutos(), sit.estadoEfectivo(), sit.mensaje());
    }

    /**
     * Valida que un permiso presentado sea legítimo para esta caja/negocio y no haya
     * expirado. Lo usará la API de ventas (Paso 5) para no cobrar sin permiso vigente.
     */
    public void exigirPermisoVigente(String permisoToken, Long negocioId, Long cajaId) {
        JwtService.Permiso p;
        try {
            p = jwtService.validarPermiso(permisoToken);
        } catch (Exception e) {
            throw new PermisoDenegadoException("Permiso de cobro inválido o vencido");
        }
        if (!p.negocioId().equals(negocioId) || !p.cajaId().equals(cajaId)) {
            throw new PermisoDenegadoException("El permiso no corresponde a esta caja");
        }
    }

    public record PermisoEmitido(String permiso, long leaseMinutos, String estado, String mensaje) {
    }
}
