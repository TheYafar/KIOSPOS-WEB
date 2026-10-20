package com.kioskpos.web.cuadre;

import com.kioskpos.web.tenant.NegocioContext;
import com.kioskpos.web.venta.MetodoPago;
import com.kioskpos.web.venta.PagoVenta;
import com.kioskpos.web.venta.Venta;
import com.kioskpos.web.venta.VentaRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cuadre de caja: abrir turno con un fondo y cerrarlo contando el efectivo (cierre
 * simple). Esta lógica vivía dentro del controlador del escritorio (CashRegister
 * Controller); aquí está en un servicio para que la usen el servidor y las pruebas.
 *
 * Esperado en gaveta = fondo + efectivo cobrado − vuelto entregado. El vuelto siempre
 * sale de la caja (CLAUDE.md §9). Lo contado ES la gaveta completa (con la base
 * adentro): el esperado ya incluye la base, así que NO se vuelve a sumar la apertura
 * (evita la "doble suma" del cierre).
 */
@Service
public class CuadreService {

    private final TurnoRepository turnoRepository;
    private final VentaRepository ventaRepository;

    public CuadreService(TurnoRepository turnoRepository, VentaRepository ventaRepository) {
        this.turnoRepository = turnoRepository;
        this.ventaRepository = ventaRepository;
    }

    @Transactional
    public Turno abrir(Long cajaId, Long usuarioId, BigDecimal fondoUsd, BigDecimal fondoBs) {
        turnoRepository.findFirstByCajaIdAndEstado(cajaId, Turno.Estado.ABIERTO.name()).ifPresent(t -> {
            throw new IllegalStateException("Esta caja ya tiene un turno abierto");
        });
        Turno turno = new Turno();
        turno.setNegocioId(NegocioContext.require());
        turno.setCajaId(cajaId);
        turno.setUsuarioId(usuarioId);
        turno.setFondoInicialUsd(noNeg(fondoUsd));
        turno.setFondoInicialBs(noNeg(fondoBs));
        turno.setEstado(Turno.Estado.ABIERTO.name());
        return turnoRepository.save(turno);
    }

    @Transactional(readOnly = true)
    public Resumen resumen(Long turnoId) {
        Turno turno = cargar(turnoId);
        return calcular(turno);
    }

    /** Cierre simple: compara lo contado contra lo esperado y guarda la diferencia. */
    @Transactional
    public Resumen cerrarSimple(Long turnoId, BigDecimal declaradoUsd, BigDecimal declaradoBs) {
        Turno turno = cargar(turnoId);
        if (!Turno.Estado.ABIERTO.name().equals(turno.getEstado())) {
            throw new IllegalStateException("El turno ya está cerrado");
        }
        Resumen r = calcular(turno);
        BigDecimal dUsd = noNeg(declaradoUsd);
        BigDecimal dBs = noNeg(declaradoBs);
        BigDecimal difUsd = dUsd.subtract(r.esperadoUsd()).setScale(2, RoundingMode.HALF_UP);
        BigDecimal difBs = dBs.subtract(r.esperadoBs()).setScale(2, RoundingMode.HALF_UP);

        turno.setDeclaradoUsd(dUsd);
        turno.setDeclaradoBs(dBs);
        turno.setDiferenciaUsd(difUsd);
        turno.setDiferenciaBs(difBs);
        turno.setEstado(Turno.Estado.CERRADO.name());
        turno.setFechaCierre(Instant.now());
        turnoRepository.save(turno);

        return new Resumen(turno.getId(), turno.getEstado(), r.fondoUsd(), r.fondoBs(),
                r.efectivoUsd(), r.efectivoBs(), r.vueltoUsd(), r.vueltoBs(),
                r.esperadoUsd(), r.esperadoBs(), dUsd, dBs, difUsd, difBs);
    }

    private Resumen calcular(Turno turno) {
        BigDecimal efectivoUsd = BigDecimal.ZERO;
        BigDecimal efectivoBs = BigDecimal.ZERO;
        BigDecimal vueltoUsd = BigDecimal.ZERO;
        BigDecimal vueltoBs = BigDecimal.ZERO;

        for (Venta v : ventaRepository.findByTurnoId(turno.getId())) {
            if ("ANULADA".equals(v.getEstado())) {
                continue;
            }
            vueltoUsd = vueltoUsd.add(v.getVueltoUsd());
            vueltoBs = vueltoBs.add(v.getVueltoBs());
            for (PagoVenta p : v.getPagos()) {
                if (p.getMetodo() == MetodoPago.EFECTIVO_USD) {
                    efectivoUsd = efectivoUsd.add(p.getMontoOriginal());
                } else if (p.getMetodo() == MetodoPago.EFECTIVO_BS) {
                    efectivoBs = efectivoBs.add(p.getMontoOriginal());
                }
            }
        }

        BigDecimal fondoUsd = turno.getFondoInicialUsd();
        BigDecimal fondoBs = turno.getFondoInicialBs();
        BigDecimal esperadoUsd = noNeg(fondoUsd.add(efectivoUsd).subtract(vueltoUsd)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal esperadoBs = noNeg(fondoBs.add(efectivoBs).subtract(vueltoBs)).setScale(2, RoundingMode.HALF_UP);

        return new Resumen(turno.getId(), turno.getEstado(), fondoUsd, fondoBs,
                efectivoUsd.setScale(2, RoundingMode.HALF_UP), efectivoBs.setScale(2, RoundingMode.HALF_UP),
                vueltoUsd.setScale(2, RoundingMode.HALF_UP), vueltoBs.setScale(2, RoundingMode.HALF_UP),
                esperadoUsd, esperadoBs, null, null, null, null);
    }

    private Turno cargar(Long id) {
        return turnoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Turno no encontrado"));
    }

    private static BigDecimal noNeg(BigDecimal v) {
        if (v == null) {
            return BigDecimal.ZERO;
        }
        return v.signum() < 0 ? BigDecimal.ZERO : v;
    }

    public record Resumen(Long turnoId, String estado,
                          BigDecimal fondoUsd, BigDecimal fondoBs,
                          BigDecimal efectivoUsd, BigDecimal efectivoBs,
                          BigDecimal vueltoUsd, BigDecimal vueltoBs,
                          BigDecimal esperadoUsd, BigDecimal esperadoBs,
                          BigDecimal declaradoUsd, BigDecimal declaradoBs,
                          BigDecimal diferenciaUsd, BigDecimal diferenciaBs) {
    }
}
