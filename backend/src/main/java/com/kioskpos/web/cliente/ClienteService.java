package com.kioskpos.web.cliente;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cuadre.Turno;
import com.kioskpos.web.cuadre.TurnoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Libreta de fiado: clientes, lo que deben (cargos de ventas fiadas) y sus abonos.
 * Saldo = cargos − abonos, en USD. Un abono en efectivo hecho en la caja suma a la
 * gaveta del turno (CuadreService); uno digital suma a su método.
 */
@Service
public class ClienteService {

    static final Set<String> METODOS_ABONO = Set.of("EFECTIVO_USD", "EFECTIVO_BS", "PUNTO", "PAGO_MOVIL", "BIOPAGO");

    private final ClienteRepository clientes;
    private final MovimientoClienteRepository movimientos;
    private final TurnoRepository turnos;

    public ClienteService(ClienteRepository clientes, MovimientoClienteRepository movimientos, TurnoRepository turnos) {
        this.clientes = clientes;
        this.movimientos = movimientos;
        this.turnos = turnos;
    }

    public record ClienteVista(Long id, String nombre, String cedula, String telefono, BigDecimal limiteUsd,
                               boolean activo, BigDecimal saldoUsd, Instant ultimoMovimiento, String tipo, BigDecimal sueldoUsd) {
    }

    public record Detalle(ClienteVista cliente, List<MovimientoCliente> movimientos) {
    }

    public record Datos(String nombre, String cedula, String telefono, BigDecimal limiteUsd, Boolean activo,
                        String tipo, BigDecimal sueldoUsd) {
        public Datos(String nombre, String cedula, String telefono, BigDecimal limiteUsd, Boolean activo) {
            this(nombre, cedula, telefono, limiteUsd, activo, null, null);
        }
    }

    public record Abono(String metodo, BigDecimal monto, BigDecimal tasa, String referencia, String nota) {
    }

    @Transactional(readOnly = true)
    public List<ClienteVista> listar(String q, String tipo) {
        return listar(q).stream().filter(v -> tipo == null || tipo.isBlank() || tipo.equals(v.tipo())).toList();
    }

    @Transactional(readOnly = true)
    public List<ClienteVista> listar(String q) {
        Map<Long, Object[]> s = new HashMap<>();
        for (Object[] r : movimientos.saldos()) {
            s.put((Long) r[0], r);
        }
        String f = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        return clientes.findAllByOrderByNombreAsc().stream()
                .filter(c -> f.isEmpty() || c.getNombre().toLowerCase(Locale.ROOT).contains(f)
                        || (c.getCedula() != null && c.getCedula().contains(f))
                        || (c.getTelefono() != null && c.getTelefono().contains(f)))
                .map(c -> {
                    Object[] r = s.get(c.getId());
                    return vista(c, r == null || r[1] == null ? BigDecimal.ZERO : new BigDecimal(r[1].toString()),
                            r == null ? null : (Instant) r[2]);
                })
                // Primero los que deben (más deuda arriba), luego el resto por nombre.
                .sorted(Comparator.comparing((ClienteVista v) -> v.saldoUsd().signum() > 0 ? 0 : 1)
                        .thenComparing(ClienteVista::saldoUsd, Comparator.reverseOrder()))
                .toList();
    }

    @Transactional(readOnly = true)
    public Detalle detalle(Long id) {
        Cliente c = buscar(id);
        return new Detalle(vista(c, saldo(id), null), movimientos.findByClienteIdOrderByCreatedAtDescIdDesc(id));
    }

    @Transactional
    public ClienteVista crear(Datos d) {
        Cliente c = new Cliente();
        c.setNegocioId(NegocioContext.require());
        aplicar(c, d);
        return guardar(c, BigDecimal.ZERO);
    }

    @Transactional
    public ClienteVista actualizar(Long id, Datos d) {
        Cliente c = buscar(id);
        aplicar(c, d);
        if (d.activo() != null) {
            c.setActivo(d.activo());
        }
        return guardar(c, saldo(id));
    }

    /** Antes de cobrar fiado: cliente activo y sin pasar su límite. */
    @Transactional
    public Cliente validarFiado(Long clienteId, BigDecimal montoUsd) {
        if (clienteId == null) {
            throw new IllegalArgumentException("Para dar crédito hay que elegir el cliente");
        }
        Cliente c = clientes.bloquear(clienteId).orElseThrow(() -> new IllegalArgumentException("Cliente no encontrado"));
        if (!c.isActivo()) {
            throw new IllegalArgumentException("A " + c.getNombre() + " no se le está fiando (cliente desactivado)");
        }
        BigDecimal limite = c.getLimiteCreditoUsd();
        // Un trabajador sin límite propio no puede deber más que su sueldo.
        if ("TRABAJADOR".equals(c.getTipo()) && (limite == null || limite.signum() <= 0)
                && c.getSueldoUsd() != null && c.getSueldoUsd().signum() > 0) {
            limite = c.getSueldoUsd();
        }
        if (limite != null && limite.signum() > 0) {
            BigDecimal saldo = saldo(clienteId);
            if (saldo.add(montoUsd).compareTo(limite) > 0) {
                throw new IllegalArgumentException("Pasa el límite de crédito de " + c.getNombre() + ": debe $"
                        + saldo.setScale(2, RoundingMode.HALF_UP).toPlainString() + " y el límite es $"
                        + limite.setScale(2, RoundingMode.HALF_UP).toPlainString());
            }
        }
        return c;
    }

    /** Registra lo fiado en una venta (lo llama VentaService dentro de su transacción). */
    @Transactional
    public MovimientoCliente cargar(Long clienteId, BigDecimal montoUsd, Long ventaId, Long turnoId, Long cajaId, Long usuarioId) {
        MovimientoCliente m = new MovimientoCliente();
        m.setNegocioId(NegocioContext.require());
        m.setClienteId(clienteId);
        m.setTipo(MovimientoCliente.Tipo.CARGO.name());
        m.setMontoUsd(montoUsd.setScale(2, RoundingMode.HALF_UP));
        m.setVentaId(ventaId);
        m.setTurnoId(turnoId);
        m.setCajaId(cajaId);
        m.setUsuarioId(usuarioId);
        m.setMetodo("FIADO");
        m.setMoneda("USD");
        m.setMontoOriginal(m.getMontoUsd());
        return movimientos.save(m);
    }

    /** El cliente paga (todo o parte). En una caja, exige el turno abierto (entra al cuadre). */
    @Transactional
    public MovimientoCliente abonar(KioskPrincipal principal, Long clienteId, Abono a) {
        Cliente c = buscar(clienteId);
        if (a.metodo() == null || !METODOS_ABONO.contains(a.metodo())) {
            throw new IllegalArgumentException("¿Cómo pagó? (efectivo $, efectivo Bs, punto, pago móvil o biopago)");
        }
        BigDecimal monto = a.monto() == null ? BigDecimal.ZERO : a.monto().setScale(2, RoundingMode.HALF_UP);
        if (monto.signum() <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a 0");
        }
        boolean enUsd = "EFECTIVO_USD".equals(a.metodo());
        if (!enUsd && (a.tasa() == null || a.tasa().signum() <= 0)) {
            throw new IllegalArgumentException("Falta la tasa para un abono en bolívares");
        }
        BigDecimal montoUsd = enUsd ? monto : monto.divide(a.tasa(), 2, RoundingMode.HALF_UP);
        BigDecimal saldo = saldo(clienteId);
        if (saldo.signum() <= 0) {
            throw new IllegalArgumentException(c.getNombre() + " no debe nada");
        }
        if (montoUsd.compareTo(saldo.add(new BigDecimal("0.05"))) > 0) {
            throw new IllegalArgumentException("El abono ($" + montoUsd.toPlainString() + ") es mayor que la deuda ($"
                    + saldo.setScale(2, RoundingMode.HALF_UP).toPlainString() + ")");
        }
        montoUsd = montoUsd.min(saldo); // redondeo de la tasa: nunca deja saldo a favor por céntimos

        Long turnoId = null;
        if (principal != null && principal.cajaId() != null) {
            turnoId = turnos.findFirstByCajaIdAndEstado(principal.cajaId(), Turno.Estado.ABIERTO.name())
                    .orElseThrow(() -> new IllegalStateException("La caja está cerrada. Ábrela para recibir el abono."))
                    .getId();
        }
        MovimientoCliente m = new MovimientoCliente();
        m.setNegocioId(NegocioContext.require());
        m.setClienteId(clienteId);
        m.setTipo(MovimientoCliente.Tipo.ABONO.name());
        m.setMontoUsd(montoUsd);
        m.setTurnoId(turnoId);
        m.setCajaId(principal == null ? null : principal.cajaId());
        m.setUsuarioId(principal == null ? null : principal.usuarioId());
        m.setMetodo(a.metodo());
        m.setMoneda(enUsd ? "USD" : "VES");
        m.setMontoOriginal(monto);
        m.setTasa(enUsd ? null : a.tasa());
        m.setReferencia(recortar(a.referencia(), 100));
        m.setNota(recortar(a.nota(), 200));
        return movimientos.save(m);
    }

    /**
     * El dueño descuenta del sueldo de un trabajador lo que debe (todo o una parte).
     * No entra dinero a ninguna caja: queda como abono con método NOMINA.
     */
    @Transactional
    public MovimientoCliente descontarDelSueldo(KioskPrincipal principal, Long clienteId, BigDecimal montoUsd, String nota) {
        Cliente c = buscar(clienteId);
        if (!"TRABAJADOR".equals(c.getTipo())) {
            throw new IllegalArgumentException(c.getNombre() + " no está anotado como trabajador");
        }
        BigDecimal saldo = saldo(clienteId);
        if (saldo.signum() <= 0) {
            throw new IllegalArgumentException(c.getNombre() + " no debe nada");
        }
        BigDecimal monto = montoUsd == null ? saldo : montoUsd.setScale(2, RoundingMode.HALF_UP);
        if (monto.signum() <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a 0");
        }
        if (monto.compareTo(saldo) > 0) {
            throw new IllegalArgumentException("Debe $" + saldo.setScale(2, RoundingMode.HALF_UP).toPlainString() + "; no se puede descontar más");
        }
        MovimientoCliente m = new MovimientoCliente();
        m.setNegocioId(NegocioContext.require());
        m.setClienteId(clienteId);
        m.setTipo(MovimientoCliente.Tipo.ABONO.name());
        m.setMontoUsd(monto);
        m.setUsuarioId(principal == null ? null : principal.usuarioId());
        m.setMetodo("NOMINA");
        m.setMoneda("USD");
        m.setMontoOriginal(monto);
        m.setNota(recortar(nota == null || nota.isBlank() ? "Descontado del sueldo" : nota, 200));
        return movimientos.save(m);
    }

    /** Vuelve a cargar a la cuenta lo que se había descontado (ej. un pago de nómina anulado). */
    @Transactional
    public MovimientoCliente reponerDeuda(KioskPrincipal principal, Long clienteId, BigDecimal montoUsd, String nota) {
        buscar(clienteId);
        MovimientoCliente m = new MovimientoCliente();
        m.setNegocioId(NegocioContext.require());
        m.setClienteId(clienteId);
        m.setTipo(MovimientoCliente.Tipo.CARGO.name());
        m.setMontoUsd(montoUsd.setScale(2, RoundingMode.HALF_UP));
        m.setUsuarioId(principal == null ? null : principal.usuarioId());
        m.setMetodo("NOMINA_ANULADA");
        m.setMoneda("USD");
        m.setMontoOriginal(m.getMontoUsd());
        m.setNota(recortar(nota, 200));
        return movimientos.save(m);
    }

    /**
     * Baja la deuda por una venta anulada o devuelta (no entra dinero a ninguna caja).
     * Nunca deja saldo a favor: abona como mucho lo que debe. Devuelve lo abonado.
     */
    @Transactional
    public BigDecimal descontarPorVenta(Long clienteId, BigDecimal montoUsd, Long ventaId, String motivo, Long usuarioId) {
        BigDecimal monto = montoUsd.min(saldo(clienteId)).setScale(2, RoundingMode.HALF_UP);
        if (monto.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        MovimientoCliente m = new MovimientoCliente();
        m.setNegocioId(NegocioContext.require());
        m.setClienteId(clienteId);
        m.setTipo(MovimientoCliente.Tipo.ABONO.name());
        m.setMontoUsd(monto);
        m.setVentaId(ventaId);
        m.setUsuarioId(usuarioId);
        m.setMetodo(motivo);   // ANULACION o DEVOLUCION: no cuenta como dinero en el cuadre
        m.setMoneda("USD");
        m.setMontoOriginal(monto);
        m.setNota("ANULACION".equals(motivo) ? "Venta anulada" : "Devolución de mercancía");
        movimientos.save(m);
        return monto;
    }

    /** Saldo actual (USD) de un cliente. */
    @Transactional(readOnly = true)
    public BigDecimal saldoDe(Long clienteId) {
        return saldo(clienteId);
    }

    private BigDecimal saldo(Long clienteId) {
        Object s = movimientos.saldo(clienteId);
        return s == null ? BigDecimal.ZERO : new BigDecimal(s.toString());
    }

    private void aplicar(Cliente c, Datos d) {
        String nombre = d.nombre() == null ? "" : d.nombre().trim();
        if (nombre.isEmpty()) {
            throw new IllegalArgumentException("Escribe el nombre del cliente");
        }
        c.setNombre(recortar(nombre, 120));
        String ced = d.cedula() == null ? null : d.cedula().replaceAll("[^0-9VEJvej]", "").toUpperCase(Locale.ROOT);
        c.setCedula(ced == null || ced.isEmpty() ? null : recortar(ced, 20));
        c.setTelefono(recortar(d.telefono(), 30));
        BigDecimal lim = d.limiteUsd() == null ? BigDecimal.ZERO : d.limiteUsd();
        if (lim.signum() < 0) {
            throw new IllegalArgumentException("El límite no puede ser negativo");
        }
        c.setLimiteCreditoUsd(lim.setScale(2, RoundingMode.HALF_UP));
        if (d.tipo() != null) {
            if (!"CLIENTE".equals(d.tipo()) && !"TRABAJADOR".equals(d.tipo())) {
                throw new IllegalArgumentException("Tipo inválido");
            }
            c.setTipo(d.tipo());
        }
        if (d.sueldoUsd() != null) {
            if (d.sueldoUsd().signum() < 0) {
                throw new IllegalArgumentException("El sueldo no puede ser negativo");
            }
            c.setSueldoUsd(d.sueldoUsd().setScale(2, RoundingMode.HALF_UP));
        }
    }

    private ClienteVista guardar(Cliente c, BigDecimal saldo) {
        try {
            return vista(clientes.saveAndFlush(c), saldo, null);
        } catch (DataIntegrityViolationException e) {
            throw new IllegalArgumentException("Ya hay un cliente con esa cédula");
        }
    }

    private Cliente buscar(Long id) {
        return clientes.findById(id).orElseThrow(() -> new IllegalArgumentException("Cliente no encontrado"));
    }

    private static ClienteVista vista(Cliente c, BigDecimal saldo, Instant ultimo) {
        return new ClienteVista(c.getId(), c.getNombre(), c.getCedula(), c.getTelefono(), c.getLimiteCreditoUsd(),
                c.isActivo(), saldo.setScale(2, RoundingMode.HALF_UP), ultimo, c.getTipo(), c.getSueldoUsd());
    }

    private static String recortar(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
