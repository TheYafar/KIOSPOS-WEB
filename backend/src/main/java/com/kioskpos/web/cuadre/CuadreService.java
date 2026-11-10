package com.kioskpos.web.cuadre;

import com.kioskpos.web.cliente.MovimientoCliente;
import com.kioskpos.web.cliente.MovimientoClienteRepository;
import com.kioskpos.web.tenant.NegocioContext;
import com.kioskpos.web.venta.MetodoPago;
import com.kioskpos.web.venta.PagoVenta;
import com.kioskpos.web.venta.Venta;
import com.kioskpos.web.venta.VentaRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
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
 *
 * Además: − gastos, retiros y avances entregados; + ingresos y abonos de fiado en
 * efectivo. Los avances y abonos digitales suman a su método (punto, pago móvil...).
 */
@Service
public class CuadreService {

    private final TurnoRepository turnoRepository;
    private final VentaRepository ventaRepository;
    private final MovimientoCajaRepository movimientoCajaRepository;
    private final MovimientoClienteRepository movimientoClienteRepository;
    private final com.kioskpos.web.devolucion.DevolucionRepository devolucionRepository;

    public CuadreService(TurnoRepository turnoRepository, VentaRepository ventaRepository,
                         MovimientoCajaRepository movimientoCajaRepository,
                         MovimientoClienteRepository movimientoClienteRepository,
                         com.kioskpos.web.devolucion.DevolucionRepository devolucionRepository) {
        this.devolucionRepository = devolucionRepository;
        this.turnoRepository = turnoRepository;
        this.ventaRepository = ventaRepository;
        this.movimientoCajaRepository = movimientoCajaRepository;
        this.movimientoClienteRepository = movimientoClienteRepository;
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

    /** El turno ABIERTO de una caja, si hay (para que la caja lo recupere aunque el equipo lo olvide). */
    @Transactional(readOnly = true)
    public java.util.Optional<Turno> turnoAbierto(Long cajaId) {
        return turnoRepository.findFirstByCajaIdAndEstado(cajaId, Turno.Estado.ABIERTO.name());
    }

    /** Cierre simple: compara lo contado contra lo esperado y guarda la diferencia. */
    @Transactional
    public Resumen cerrarSimple(Long turnoId, BigDecimal declaradoUsd, BigDecimal declaradoBs) {
        return cerrarSimple(turnoId, declaradoUsd, declaradoBs, null, null);
    }

    /**
     * Cierre con arqueo detallado: además del efectivo (que define la diferencia
     * oficial de la gaveta), guarda lo contado en cada forma de pago y observaciones.
     */
    @Transactional
    public Resumen cerrarSimple(Long turnoId, BigDecimal declaradoUsd, BigDecimal declaradoBs,
                                String arqueoDetalle, String observaciones) {
        Turno turno = cargar(turnoId);
        if (!Turno.Estado.ABIERTO.name().equals(turno.getEstado())) {
            throw new IllegalStateException("El turno ya está cerrado");
        }
        turno.setArqueoDetalle(recortar(arqueoDetalle, 8000));
        turno.setObservaciones(recortar(observaciones, 500));
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
                r.esperadoUsd(), r.esperadoBs(), dUsd, dBs, difUsd, difBs, r.metodos(), r.movimientos(),
                r.fiadoUsd(), r.comisionAvancesBs());
    }

    private Resumen calcular(Turno turno) {
        BigDecimal efectivoUsd = BigDecimal.ZERO;
        BigDecimal efectivoBs = BigDecimal.ZERO;
        BigDecimal vueltoUsd = BigDecimal.ZERO;
        BigDecimal vueltoBs = BigDecimal.ZERO;
        // Métodos digitales (en Bs): no afectan la gaveta, pero se muestran para verificar
        // contra lo que reporta el punto / pago móvil / Biopago.
        BigDecimal puntoBs = BigDecimal.ZERO;
        BigDecimal pagoMovilBs = BigDecimal.ZERO;
        BigDecimal biopagoBs = BigDecimal.ZERO;
        BigDecimal otrosUsd = BigDecimal.ZERO;   // formas/monedas extra (OTRO) cobradas en $
        BigDecimal otrosBs = BigDecimal.ZERO;    // ... y en Bs
        BigDecimal fiadoUsd = BigDecimal.ZERO;   // vendido fiado: no entra dinero

        for (Venta v : ventaRepository.findByTurnoId(turno.getId())) {
            if ("ANULADA".equals(v.getEstado())) {
                continue;
            }
            vueltoUsd = vueltoUsd.add(v.getVueltoUsd());
            vueltoBs = vueltoBs.add(v.getVueltoBs());
            for (PagoVenta p : v.getPagos()) {
                BigDecimal m = p.getMontoOriginal();
                switch (p.getMetodo()) {
                    case EFECTIVO_USD -> efectivoUsd = efectivoUsd.add(m);
                    case EFECTIVO_BS -> efectivoBs = efectivoBs.add(m);
                    case PUNTO -> puntoBs = puntoBs.add(m);
                    case PAGO_MOVIL -> pagoMovilBs = pagoMovilBs.add(m);
                    case BIOPAGO -> biopagoBs = biopagoBs.add(m);
                    case FIADO -> fiadoUsd = fiadoUsd.add(m);
                    case OTRO -> {
                        if (p.getMoneda() == com.kioskpos.web.venta.Moneda.USD) {
                            otrosUsd = otrosUsd.add(m);
                        } else {
                            otrosBs = otrosBs.add(m);
                        }
                    }
                    default -> { /* nada */ }
                }
            }
        }

        // Movimientos de efectivo que no son ventas (gastos, retiros, ingresos, avances).
        Acum mov = new Acum();
        BigDecimal comisionAvancesBs = BigDecimal.ZERO;
        for (MovimientoCaja mc : movimientoCajaRepository.findByTurnoIdAndAnuladoFalse(turno.getId())) {
            MovimientoCaja.Tipo tipo = MovimientoCaja.Tipo.valueOf(mc.getTipo());
            mov.sumar(tipo.name(), mc.getMoneda(), mc.getMonto());
            if (tipo == MovimientoCaja.Tipo.AVANCE) {
                comisionAvancesBs = comisionAvancesBs.add(mc.getComision() == null ? BigDecimal.ZERO : mc.getComision());
                switch (mc.getMetodoCobro()) {
                    case "PUNTO" -> puntoBs = puntoBs.add(mc.getMontoCobrado());
                    case "PAGO_MOVIL" -> pagoMovilBs = pagoMovilBs.add(mc.getMontoCobrado());
                    case "BIOPAGO" -> biopagoBs = biopagoBs.add(mc.getMontoCobrado());
                    default -> { /* validado al registrar */ }
                }
            }
        }
        // Abonos de fiado recibidos en este turno.
        for (MovimientoCliente ab : movimientoClienteRepository.findByTurnoIdAndTipo(turno.getId(), MovimientoCliente.Tipo.ABONO.name())) {
            BigDecimal m = ab.getMontoOriginal();
            switch (ab.getMetodo()) {
                case "EFECTIVO_USD" -> mov.sumar("ABONO", "USD", m);
                case "EFECTIVO_BS" -> mov.sumar("ABONO", "VES", m);
                case "PUNTO" -> puntoBs = puntoBs.add(m);
                case "PAGO_MOVIL" -> pagoMovilBs = pagoMovilBs.add(m);
                case "BIOPAGO" -> biopagoBs = biopagoBs.add(m);
                default -> { /* validado al registrar */ }
            }
        }

        // Devoluciones reembolsadas en efectivo desde esta gaveta.
        for (var dv : devolucionRepository.findByTurnoId(turno.getId())) {
            if ("EFECTIVO_USD".equals(dv.getMetodoReembolso())) {
                mov.sumar("DEVOLUCION", "USD", dv.getMontoReembolso());
            } else if ("EFECTIVO_BS".equals(dv.getMetodoReembolso())) {
                mov.sumar("DEVOLUCION", "VES", dv.getMontoReembolso());
            }
        }

        BigDecimal fondoUsd = turno.getFondoInicialUsd();
        BigDecimal fondoBs = turno.getFondoInicialBs();
        BigDecimal esperadoUsd = noNeg(fondoUsd.add(efectivoUsd).subtract(vueltoUsd)
                .add(mov.entra("USD")).subtract(mov.sale("USD"))).setScale(2, RoundingMode.HALF_UP);
        BigDecimal esperadoBs = noNeg(fondoBs.add(efectivoBs).subtract(vueltoBs)
                .add(mov.entra("VES")).subtract(mov.sale("VES"))).setScale(2, RoundingMode.HALF_UP);

        // Lista con TODOS los métodos (el cajero ve cada uno y si cuadra). El efectivo lleva
        // el esperado de la gaveta (fondo + cobrado − vuelto); los digitales, lo cobrado exacto.
        List<MetodoLinea> metodos = new ArrayList<>();
        metodos.add(new MetodoLinea("EFECTIVO_USD", "USD", esperadoUsd, false));
        metodos.add(new MetodoLinea("EFECTIVO_BS", "VES", esperadoBs, false));
        metodos.add(new MetodoLinea("PUNTO", "VES", puntoBs.setScale(2, RoundingMode.HALF_UP), true));
        metodos.add(new MetodoLinea("PAGO_MOVIL", "VES", pagoMovilBs.setScale(2, RoundingMode.HALF_UP), true));
        metodos.add(new MetodoLinea("BIOPAGO", "VES", biopagoBs.setScale(2, RoundingMode.HALF_UP), true));
        if (otrosUsd.signum() != 0) {
            metodos.add(new MetodoLinea("OTRO_USD", "USD", otrosUsd.setScale(2, RoundingMode.HALF_UP), true));
        }
        if (otrosBs.signum() != 0) {
            metodos.add(new MetodoLinea("OTRO_BS", "VES", otrosBs.setScale(2, RoundingMode.HALF_UP), true));
        }

        return new Resumen(turno.getId(), turno.getEstado(), fondoUsd, fondoBs,
                efectivoUsd.setScale(2, RoundingMode.HALF_UP), efectivoBs.setScale(2, RoundingMode.HALF_UP),
                vueltoUsd.setScale(2, RoundingMode.HALF_UP), vueltoBs.setScale(2, RoundingMode.HALF_UP),
                esperadoUsd, esperadoBs, null, null, null, null, metodos, mov.lineas(),
                fiadoUsd.setScale(2, RoundingMode.HALF_UP), comisionAvancesBs.setScale(2, RoundingMode.HALF_UP));
    }

    /** Suma movimientos por tipo y moneda. GASTO/RETIRO/AVANCE salen; INGRESO/ABONO entran. */
    private static final class Acum {
        private final java.util.Map<String, MovLinea> m = new java.util.LinkedHashMap<>();

        void sumar(String tipo, String moneda, BigDecimal monto) {
            m.merge(tipo + ":" + moneda, new MovLinea(tipo, moneda, monto, 1),
                    (a, b) -> new MovLinea(a.tipo(), a.moneda(), a.total().add(b.total()), a.cantidad() + 1));
        }

        BigDecimal entra(String moneda) {
            return total(moneda, List.of("INGRESO", "ABONO"));
        }

        BigDecimal sale(String moneda) {
            return total(moneda, List.of("GASTO", "RETIRO", "AVANCE", "DEVOLUCION"));
        }

        private BigDecimal total(String moneda, List<String> tipos) {
            return m.values().stream().filter(l -> l.moneda().equals(moneda) && tipos.contains(l.tipo()))
                    .map(MovLinea::total).reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        List<MovLinea> lineas() {
            return m.values().stream().map(l -> new MovLinea(l.tipo(), l.moneda(),
                    l.total().setScale(2, RoundingMode.HALF_UP), l.cantidad())).toList();
        }
    }

    private Turno cargar(Long id) {
        return turnoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Turno no encontrado"));
    }

    private static String recortar(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
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
                          BigDecimal diferenciaUsd, BigDecimal diferenciaBs,
                          List<MetodoLinea> metodos,
                          List<MovLinea> movimientos,
                          BigDecimal fiadoUsd,
                          BigDecimal comisionAvancesBs) {
    }

    /** Total de movimientos de un tipo en una moneda (GASTO, RETIRO, INGRESO, AVANCE, ABONO, DEVOLUCION). */
    public record MovLinea(String tipo, String moneda, BigDecimal total, int cantidad) {
    }

    /** Un método de pago en el cuadre: cuánto debería haber según el servidor. */
    public record MetodoLinea(String metodo, String moneda, BigDecimal esperado, boolean digital) {
    }
}
