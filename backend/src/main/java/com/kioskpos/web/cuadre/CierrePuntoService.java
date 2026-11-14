package com.kioskpos.web.cuadre;

import com.kioskpos.web.auth.CajaRepository;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioRepository;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tickets de cierre del punto de venta / Biopago. El cajero los copia al cerrar su caja
 * (el papel se pierde); quedan atados al turno abierto de su caja. El dueño los ve todos
 * por fecha, con lo que el sistema registró por ese medio en el mismo turno para comparar.
 */
@Service
public class CierrePuntoService {

    static final ZoneId ZONA = ZoneId.of("America/Caracas");

    private final CierrePuntoRepository cierres;
    private final CuadreService cuadreService;
    private final CajaRepository cajas;
    private final UsuarioRepository usuarios;
    private final TurnoRepository turnos;
    private final com.kioskpos.web.venta.VentaRepository ventas;

    public CierrePuntoService(CierrePuntoRepository cierres, CuadreService cuadreService, CajaRepository cajas, UsuarioRepository usuarios,
                              TurnoRepository turnos, com.kioskpos.web.venta.VentaRepository ventas) {
        this.turnos = turnos;
        this.ventas = ventas;
        this.cierres = cierres;
        this.cuadreService = cuadreService;
        this.cajas = cajas;
        this.usuarios = usuarios;
    }

    /** Compras y anulaciones de una sección del ticket. */
    public record Seccion(Integer comprasN, BigDecimal compras, Integer anulN, BigDecimal anul) {
    }

    public record Nuevo(String tipo, String titular, String afiliado, String loteCredito, String loteDebito, String loteMasterVisa,
                        Instant fechaHora, Seccion credito, Seccion debito, Seccion masterVisa, String nota) {
    }

    public record Vista(CierrePunto cierre, String caja, String cajero, BigDecimal sistemaBs) {
    }

    @Transactional
    public CierrePunto registrar(KioskPrincipal p, Nuevo in) {
        if (p.cajaId() == null && p.rol() != RolUsuario.DUENO && p.rol() != RolUsuario.ENCARGADO) {
            throw new IllegalArgumentException("Solo la caja, el dueño o el encargado registran cierres de punto");
        }
        CierrePunto c = new CierrePunto();
        c.setNegocioId(NegocioContext.require());
        c.setUsuarioId(p.usuarioId());
        if (p.cajaId() != null) {
            Turno t = cuadreService.turnoAbierto(p.cajaId())
                    .orElseThrow(() -> new IllegalStateException("Abre la caja antes de anotar el cierre del punto"));
            c.setCajaId(p.cajaId());
            c.setTurnoId(t.getId());
        }
        String tipo = in.tipo() == null ? "PUNTO" : in.tipo().trim().toUpperCase();
        if (!tipo.equals("PUNTO") && !tipo.equals("BIOPAGO")) {
            throw new IllegalArgumentException("Tipo de equipo inválido");
        }
        c.setTipo(tipo);
        c.setTitular(texto(in.titular(), 80));
        c.setAfiliado(texto(in.afiliado(), 30));
        c.setLoteCredito(texto(in.loteCredito(), 20));
        c.setLoteDebito(texto(in.loteDebito(), 20));
        c.setLoteMasterVisa(texto(in.loteMasterVisa(), 20));
        c.setFechaHora(in.fechaHora() == null ? Instant.now() : in.fechaHora());
        c.setNota(texto(in.nota(), 300));
        // Biopago: su ticket no se divide por tipo de tarjeta; es una sola sección (transacciones y anulaciones),
        // guardada en la de débito, con su lote en loteDebito y el terminal en afiliado.
        boolean bio = tipo.equals("BIOPAGO");
        Seccion vacia = new Seccion(0, BigDecimal.ZERO, 0, BigDecimal.ZERO);
        Seccion cr = bio ? vacia : seccion(in.credito(), "Tarjeta crédito");
        Seccion de = seccion(in.debito(), bio ? "Biopago" : "Tarjeta débito");
        Seccion mv = bio ? vacia : seccion(in.masterVisa(), "Debit Master/Visa");
        if (bio) {
            c.setLoteCredito(null);
            c.setLoteMasterVisa(null);
        }
        c.setCredComprasN(cr.comprasN()); c.setCredCompras(cr.compras()); c.setCredAnulN(cr.anulN()); c.setCredAnul(cr.anul());
        c.setDebComprasN(de.comprasN()); c.setDebCompras(de.compras()); c.setDebAnulN(de.anulN()); c.setDebAnul(de.anul());
        c.setMvComprasN(mv.comprasN()); c.setMvCompras(mv.compras()); c.setMvAnulN(mv.anulN()); c.setMvAnul(mv.anul());
        BigDecimal total = cr.compras().subtract(cr.anul()).add(de.compras()).subtract(de.anul()).add(mv.compras()).subtract(mv.anul());
        if (total.signum() <= 0 && cr.comprasN() + de.comprasN() + mv.comprasN() == 0) {
            throw new IllegalArgumentException("El ticket no tiene montos: escribe las compras de al menos una sección");
        }
        c.setTotalBs(total.setScale(2, RoundingMode.HALF_UP));
        return cierres.save(c);
    }

    @Transactional(readOnly = true)
    public List<CierrePunto> delTurno(Long turnoId) {
        return cierres.findByTurnoIdOrderByFechaHoraAsc(turnoId);
    }

    /** Panel del dueño: todos los cierres entre dos días (incluidos), los más nuevos primero. */
    @Transactional(readOnly = true)
    public List<Vista> entre(LocalDate desde, LocalDate hasta) {
        if (hasta.isBefore(desde)) {
            throw new IllegalArgumentException("La fecha final es antes que la inicial");
        }
        if (desde.plusDays(370).isBefore(hasta)) {
            throw new IllegalArgumentException("Elige un rango de hasta un año");
        }
        List<CierrePunto> l = cierres.findByFechaHoraGreaterThanEqualAndFechaHoraLessThanOrderByFechaHoraDesc(
                desde.atStartOfDay(ZONA).toInstant(), hasta.plusDays(1).atStartOfDay(ZONA).toInstant());
        Map<Long, String> nCaja = new HashMap<>();
        Map<Long, String> nUsu = new HashMap<>();
        Map<String, BigDecimal> sistema = new HashMap<>();
        return l.stream().map(c -> new Vista(c,
                c.getCajaId() == null ? null : nCaja.computeIfAbsent(c.getCajaId(), id -> cajas.findById(id).map(x -> x.getNombre()).orElse("Caja " + id)),
                c.getUsuarioId() == null ? null : nUsu.computeIfAbsent(c.getUsuarioId(), id -> usuarios.findById(id).map(x -> x.getNombreCompleto()).orElse(null)),
                c.getTurnoId() == null ? null : sistema.computeIfAbsent(c.getTurnoId() + ":" + c.getTipo(), k -> sistemaDelTurno(c.getTurnoId(), c.getTipo()))))
                .toList();
    }

    /**
     * Un cierre de CAJA (turno cerrado) para el panel del dueño: qué caja, quién, de qué hora a qué hora,
     * cuánto vendió y cómo cuadró (lo esperado vs lo contado, en $ y en Bs), con el detalle del cuadre.
     */
    public record CierreCajaVista(Long turnoId, Long cajaId, String caja, String cajero,
                                  Instant fechaApertura, Instant fechaCierre,
                                  int cantidadVentas, BigDecimal vendidoUsd, BigDecimal vendidoBs,
                                  String observaciones, CuadreService.Resumen cuadre) {
    }

    /** Panel del dueño: los cierres de caja entre dos días (incluidos), los más nuevos primero. */
    @Transactional(readOnly = true)
    public List<CierreCajaVista> cierresDeCaja(LocalDate desde, LocalDate hasta) {
        if (hasta.isBefore(desde)) {
            throw new IllegalArgumentException("La fecha final es antes que la inicial");
        }
        if (desde.plusDays(370).isBefore(hasta)) {
            throw new IllegalArgumentException("Elige un rango de hasta un año");
        }
        List<Turno> l = turnos.findByEstadoAndFechaCierreGreaterThanEqualAndFechaCierreLessThanOrderByFechaCierreAsc(
                Turno.Estado.CERRADO.name(), desde.atStartOfDay(ZONA).toInstant(), hasta.plusDays(1).atStartOfDay(ZONA).toInstant());
        Map<Long, String> nCaja = new HashMap<>();
        Map<Long, String> nUsu = new HashMap<>();
        java.util.ArrayList<CierreCajaVista> out = new java.util.ArrayList<>();
        for (int i = l.size() - 1; i >= 0; i--) {
            Turno t = l.get(i);
            int n = 0;
            BigDecimal usd = BigDecimal.ZERO;
            BigDecimal bs = BigDecimal.ZERO;
            for (var v : ventas.findByTurnoId(t.getId())) {
                if ("COMPLETADA".equals(v.getEstado())) {
                    n++;
                    usd = usd.add(v.getTotalUsd());
                    bs = bs.add(v.getTotalBs());
                }
            }
            out.add(new CierreCajaVista(t.getId(), t.getCajaId(),
                    t.getCajaId() == null ? null : nCaja.computeIfAbsent(t.getCajaId(), id -> cajas.findById(id).map(x -> x.getNombre()).orElse("Caja " + id)),
                    t.getUsuarioId() == null ? null : nUsu.computeIfAbsent(t.getUsuarioId(), id -> usuarios.findById(id).map(x -> x.getNombreCompleto()).orElse(null)),
                    t.getFechaApertura(), t.getFechaCierre(), n, usd.setScale(2, RoundingMode.HALF_UP), bs.setScale(2, RoundingMode.HALF_UP),
                    t.getObservaciones(), cuadreService.resumen(t.getId())));
        }
        return out;
    }

    /** Lo que el sistema registró por ese medio (punto o biopago) en el turno. */
    private BigDecimal sistemaDelTurno(Long turnoId, String tipo) {
        try {
            return cuadreService.resumen(turnoId).metodos().stream().filter(m -> m.metodo().equals(tipo))
                    .map(m -> m.esperado()).findFirst().orElse(BigDecimal.ZERO);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** La caja borra uno suyo mientras el turno sigue abierto; el dueño/encargado, cualquiera. */
    @Transactional
    public void borrar(KioskPrincipal p, Long id) {
        CierrePunto c = cierres.findById(id).orElseThrow(() -> new IllegalArgumentException("Cierre de punto no encontrado"));
        boolean jefe = p.rol() == RolUsuario.DUENO || p.rol() == RolUsuario.ENCARGADO;
        if (!jefe) {
            boolean suyo = p.cajaId() != null && p.cajaId().equals(c.getCajaId())
                    && cuadreService.turnoAbierto(p.cajaId()).map(t -> t.getId().equals(c.getTurnoId())).orElse(false);
            if (!suyo) {
                throw new IllegalArgumentException("Solo puedes borrar los cierres de punto de tu turno abierto");
            }
        }
        cierres.delete(c);
    }

    private static Seccion seccion(Seccion s, String nombre) {
        if (s == null) {
            return new Seccion(0, BigDecimal.ZERO, 0, BigDecimal.ZERO);
        }
        int cn = s.comprasN() == null ? 0 : s.comprasN(), an = s.anulN() == null ? 0 : s.anulN();
        BigDecimal c = s.compras() == null ? BigDecimal.ZERO : s.compras().setScale(2, RoundingMode.HALF_UP);
        BigDecimal a = s.anul() == null ? BigDecimal.ZERO : s.anul().setScale(2, RoundingMode.HALF_UP);
        if (cn < 0 || an < 0 || c.signum() < 0 || a.signum() < 0) {
            throw new IllegalArgumentException(nombre + ": no puede haber números negativos");
        }
        if (a.compareTo(c) > 0) {
            throw new IllegalArgumentException(nombre + ": las anulaciones no pueden pasar de las compras");
        }
        return new Seccion(cn, c, an, a);
    }

    private static String texto(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim().replaceAll("\\s+", " ");
        return t.length() > max ? t.substring(0, max) : t;
    }
}
