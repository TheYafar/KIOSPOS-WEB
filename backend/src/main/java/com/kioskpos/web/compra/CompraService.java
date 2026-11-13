package com.kioskpos.web.compra;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.inventario.InventarioService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Proveedores y facturas de compra. Registrar una compra SUMA la mercancía al stock
 * (de forma atómica) y recalcula el COSTO PROMEDIO ponderado de cada producto:
 *   costo nuevo = (stock previo × costo previo + cantidad × costo de compra) / (stock previo + cantidad)
 * Si el stock previo era 0 o negativo, el costo nuevo es el de la compra.
 */
@Service
public class CompraService {

    private final ProveedorRepository proveedores;
    private final CompraRepository compras;
    private final CompraDetalleRepository detalles;
    private final CompraAbonoRepository abonos;
    private final CompraFotoRepository fotos;
    private final ProductoRepository productos;
    private final InventarioService inventario;

    public CompraService(ProveedorRepository proveedores, CompraRepository compras, CompraDetalleRepository detalles,
                         CompraAbonoRepository abonos, CompraFotoRepository fotos,
                         ProductoRepository productos, InventarioService inventario) {
        this.proveedores = proveedores;
        this.compras = compras;
        this.detalles = detalles;
        this.abonos = abonos;
        this.fotos = fotos;
        this.productos = productos;
        this.inventario = inventario;
    }

    // ---------- Proveedores ----------

    public record DatosProveedor(String nombre, String rif, String telefono, String contacto, Boolean activo) {
    }

    public record ProveedorVista(Long id, String nombre, String rif, String telefono, String contacto, boolean activo,
                                 BigDecimal porPagarUsd, int compras) {
    }

    @Transactional(readOnly = true)
    public List<ProveedorVista> proveedores() {
        Map<Long, BigDecimal> deuda = new HashMap<>();
        Map<Long, Integer> cuantas = new HashMap<>();
        for (Compra c : compras.findTop200ByOrderByFechaDescIdDesc()) {
            if (c.getProveedorId() == null || !"REGISTRADA".equals(c.getEstado())) {
                continue;
            }
            cuantas.merge(c.getProveedorId(), 1, Integer::sum);
            BigDecimal saldo = saldoDe(c);
            if (saldo.signum() > 0) {
                deuda.merge(c.getProveedorId(), saldo, BigDecimal::add);
            }
        }
        return proveedores.findAllByOrderByNombreAsc().stream()
                .map(p -> new ProveedorVista(p.getId(), p.getNombre(), p.getRif(), p.getTelefono(), p.getContacto(), p.isActivo(),
                        deuda.getOrDefault(p.getId(), BigDecimal.ZERO), cuantas.getOrDefault(p.getId(), 0)))
                .toList();
    }

    @Transactional
    public Proveedor guardarProveedor(Long id, DatosProveedor d) {
        Proveedor p = id == null ? new Proveedor() : proveedores.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Proveedor no encontrado"));
        if (id == null) {
            p.setNegocioId(NegocioContext.require());
        }
        String nombre = d.nombre() == null ? "" : d.nombre().trim();
        if (nombre.isEmpty()) {
            throw new IllegalArgumentException("Escribe el nombre del proveedor");
        }
        p.setNombre(recortar(nombre, 120));
        p.setRif(recortar(d.rif() == null ? null : d.rif().toUpperCase().replaceAll("\\s", ""), 20));
        p.setTelefono(recortar(d.telefono(), 30));
        p.setContacto(recortar(d.contacto(), 120));
        if (d.activo() != null) {
            p.setActivo(d.activo());
        }
        return proveedores.save(p);
    }

    // ---------- Compras ----------

    public record ItemCompra(Long productoId, BigDecimal cantidad, BigDecimal costoUsd, BigDecimal precioVentaUsd) {
    }

    public record NuevaCompra(Long proveedorId, String numeroFactura, LocalDate fecha, LocalDate vence, BigDecimal tasa,
                              Boolean pagada, String nota, List<ItemCompra> items) {
    }

    /** Metadatos de una foto (sin los bytes), para listar sin cargar megabytes. */
    public record FotoMeta(Long id, String mime) {
    }

    public record CompraVista(Compra compra, String proveedor, List<CompraDetalle> detalles,
                              List<CompraAbono> abonos, List<FotoMeta> fotos, BigDecimal saldoUsd) {
        public CompraVista(Compra compra, String proveedor, List<CompraDetalle> detalles) {
            this(compra, proveedor, detalles, List.of(), List.of(), BigDecimal.ZERO);
        }
    }

    @Transactional
    public CompraVista registrar(KioskPrincipal principal, NuevaCompra in) {
        if (in.items() == null || in.items().isEmpty()) {
            throw new IllegalArgumentException("La compra no tiene productos");
        }
        String proveedorNombre = null;
        if (in.proveedorId() != null) {
            proveedorNombre = proveedores.findById(in.proveedorId())
                    .orElseThrow(() -> new IllegalArgumentException("Proveedor no encontrado")).getNombre();
        }
        Long negocioId = NegocioContext.require();
        Compra c = new Compra();
        c.setNegocioId(negocioId);
        c.setProveedorId(in.proveedorId());
        c.setNumeroFactura(recortar(in.numeroFactura(), 40));
        c.setFecha(in.fecha() == null ? com.kioskpos.web.Fechas.hoy() : in.fecha());
        c.setTasa(in.tasa());
        boolean pagada = in.pagada() == null || in.pagada();
        c.setPagada(pagada);
        c.setVence(pagada ? null : in.vence());
        c.setNota(recortar(in.nota(), 200));
        c.setUsuarioId(principal == null ? null : principal.usuarioId());
        c.setTotalUsd(BigDecimal.ZERO);
        c = compras.save(c);

        BigDecimal total = BigDecimal.ZERO;
        List<CompraDetalle> lineas = new ArrayList<>();
        String ref = "Compra #" + c.getId() + (c.getNumeroFactura() != null ? " fact. " + c.getNumeroFactura() : "");
        for (ItemCompra it : in.items()) {
            if (it.productoId() == null) {
                throw new IllegalArgumentException("Cada línea necesita un producto");
            }
            BigDecimal cant = it.cantidad() == null ? BigDecimal.ZERO : it.cantidad();
            BigDecimal costo = it.costoUsd() == null ? BigDecimal.ZERO : it.costoUsd();
            if (cant.signum() <= 0) {
                throw new IllegalArgumentException("La cantidad debe ser mayor a 0");
            }
            if (costo.signum() < 0) {
                throw new IllegalArgumentException("El costo no puede ser negativo");
            }
            Producto p = productos.findById(it.productoId())
                    .orElseThrow(() -> new IllegalArgumentException("Producto no encontrado"));
            BigDecimal previo = p.getStockActual();
            BigDecimal nuevoCosto = costoPromedio(previo, p.getCostoUsd(), cant, costo);

            productos.sumarStock(p.getId(), cant);
            productos.fijarCosto(p.getId(), nuevoCosto);
            if (it.precioVentaUsd() != null && it.precioVentaUsd().signum() > 0) {
                productos.fijarPrecio(p.getId(), it.precioVentaUsd().setScale(2, RoundingMode.HALF_UP));
            }
            inventario.registrarMovimiento(p, "COMPRA", cant, previo, previo.add(cant), ref,
                    proveedorNombre == null ? "Compra" : "Compra a " + proveedorNombre, c.getUsuarioId());

            CompraDetalle d = new CompraDetalle();
            d.setNegocioId(negocioId);
            d.setCompraId(c.getId());
            d.setProductoId(p.getId());
            d.setNombre(p.getNombre());
            d.setCantidad(cant);
            d.setCostoUnitarioUsd(costo.setScale(4, RoundingMode.HALF_UP));
            d.setSubtotalUsd(cant.multiply(costo).setScale(2, RoundingMode.HALF_UP));
            lineas.add(detalles.save(d));
            total = total.add(d.getSubtotalUsd());
        }
        c.setTotalUsd(total);
        c.setPagadoUsd(c.isPagada() ? total : BigDecimal.ZERO);
        compras.save(c);
        return new CompraVista(c, proveedorNombre, lineas, List.of(), List.of(), saldoDe(c));
    }

    /** Costo promedio ponderado (portado de FacturaCompraService del escritorio). */
    public static BigDecimal costoPromedio(BigDecimal stockPrevio, BigDecimal costoPrevio, BigDecimal cantidad, BigDecimal costo) {
        BigDecimal sp = stockPrevio == null ? BigDecimal.ZERO : stockPrevio;
        BigDecimal cp = costoPrevio == null ? BigDecimal.ZERO : costoPrevio;
        if (sp.signum() <= 0 || cp.signum() <= 0) {
            return costo.setScale(2, RoundingMode.HALF_UP);
        }
        return sp.multiply(cp).add(cantidad.multiply(costo))
                .divide(sp.add(cantidad), 2, RoundingMode.HALF_UP);
    }

    /** Inverso de {@link #costoPromedio}: el costo que tenía el producto antes de esa compra. */
    public static BigDecimal costoSinCompra(BigDecimal stock, BigDecimal costo, BigDecimal cantidad, BigDecimal costoCompra) {
        BigDecimal resto = stock.subtract(cantidad);
        if (resto.signum() <= 0) {
            return costo; // no quedó nada de antes: el costo actual es el único dato
        }
        BigDecimal antes = stock.multiply(costo).subtract(cantidad.multiply(costoCompra)).divide(resto, 2, RoundingMode.HALF_UP);
        return antes.signum() > 0 ? antes : costo;
    }

    @Transactional(readOnly = true)
    public List<CompraVista> listar(Long proveedorId) {
        Map<Long, String> nombres = new HashMap<>();
        proveedores.findAll().forEach(p -> nombres.put(p.getId(), p.getNombre()));
        List<Compra> l = proveedorId == null ? compras.findTop200ByOrderByFechaDescIdDesc()
                : compras.findByProveedorIdOrderByFechaDescIdDesc(proveedorId);
        return l.stream().map(c -> new CompraVista(c, nombres.get(c.getProveedorId()), List.of(),
                List.of(), List.of(), saldoDe(c))).toList();
    }

    @Transactional(readOnly = true)
    public CompraVista detalle(Long id) {
        Compra c = buscar(id);
        String prov = c.getProveedorId() == null ? null
                : proveedores.findById(c.getProveedorId()).map(Proveedor::getNombre).orElse(null);
        List<FotoMeta> metas = fotos.findByCompraIdOrderByIdAsc(id).stream()
                .map(f -> new FotoMeta(f.getId(), f.getMime())).toList();
        return new CompraVista(c, prov, detalles.findByCompraIdOrderByIdAsc(id),
                abonos.findByCompraIdOrderByIdDesc(id), metas, saldoDe(c));
    }

    /** Marca una factura como pagada (saldo 0) o por pagar (sin abonos registrados). */
    @Transactional
    public Compra marcarPagada(Long id, boolean pagada) {
        Compra c = buscar(id);
        c.setPagada(pagada);
        c.setPagadoUsd(pagada ? c.getTotalUsd() : BigDecimal.ZERO);
        if (pagada) {
            c.setVence(null);
        }
        return compras.save(c);
    }

    /** Registra un abono (pago parcial) a una factura por pagar. Si cubre el saldo, queda pagada. */
    @Transactional
    public CompraVista abonar(KioskPrincipal principal, Long id, BigDecimal monto, String metodo, String nota) {
        Compra c = buscar(id);
        if (!"REGISTRADA".equals(c.getEstado())) {
            throw new IllegalStateException("La compra está anulada");
        }
        if (monto == null || monto.signum() <= 0) {
            throw new IllegalArgumentException("El abono debe ser mayor a 0");
        }
        monto = monto.setScale(2, RoundingMode.HALF_UP);
        BigDecimal saldo = saldoDe(c);
        if (saldo.signum() <= 0) {
            throw new IllegalStateException("Esta factura ya está pagada");
        }
        if (monto.compareTo(saldo) > 0) {
            monto = saldo; // no se abona más de lo que se debe
        }
        CompraAbono a = new CompraAbono();
        a.setNegocioId(NegocioContext.require());
        a.setCompraId(c.getId());
        a.setFecha(com.kioskpos.web.Fechas.hoy());
        a.setMontoUsd(monto);
        a.setMetodo(recortar(metodo, 16));
        a.setNota(recortar(nota, 200));
        a.setUsuarioId(principal == null ? null : principal.usuarioId());
        abonos.save(a);

        c.setPagadoUsd(c.getPagadoUsd().add(monto));
        if (c.getPagadoUsd().compareTo(c.getTotalUsd()) >= 0) {
            c.setPagada(true);
            c.setVence(null);
        }
        compras.save(c);
        return detalle(id);
    }

    /** Cambia la fecha de pago (vencimiento) de una factura por pagar. */
    @Transactional
    public Compra fijarVencimiento(Long id, LocalDate vence) {
        Compra c = buscar(id);
        c.setVence(c.isPagada() ? null : vence);
        return compras.save(c);
    }

    // ---------- Fotos de la factura ----------

    @Transactional
    public FotoMeta guardarFoto(Long id, String mime, String datos) {
        Compra c = buscar(id);
        if (datos == null || datos.isBlank()) {
            throw new IllegalArgumentException("La foto está vacía");
        }
        if (datos.length() > 9_000_000) {
            throw new IllegalArgumentException("La foto es muy pesada; tómala con menos resolución");
        }
        if (fotos.countByCompraId(id) >= 6) {
            throw new IllegalStateException("Ya hay 6 fotos en esta factura");
        }
        CompraFoto f = new CompraFoto();
        f.setNegocioId(NegocioContext.require());
        f.setCompraId(c.getId());
        f.setMime(mime == null || mime.isBlank() ? "image/jpeg" : recortar(mime, 40));
        f.setDatos(datos);
        f = fotos.save(f);
        return new FotoMeta(f.getId(), f.getMime());
    }

    @Transactional(readOnly = true)
    public CompraFoto foto(Long compraId, Long fotoId) {
        CompraFoto f = fotos.findById(fotoId)
                .orElseThrow(() -> new IllegalArgumentException("Foto no encontrada"));
        if (!f.getCompraId().equals(compraId)) {
            throw new IllegalArgumentException("Foto no encontrada");
        }
        return f;
    }

    @Transactional
    public void borrarFoto(Long compraId, Long fotoId) {
        fotos.delete(foto(compraId, fotoId));
    }

    /** Saldo pendiente de una factura (0 si está anulada o pagada). */
    static BigDecimal saldoDe(Compra c) {
        if (!"REGISTRADA".equals(c.getEstado())) {
            return BigDecimal.ZERO;
        }
        BigDecimal pagado = c.getPagadoUsd() == null ? BigDecimal.ZERO : c.getPagadoUsd();
        BigDecimal saldo = c.getTotalUsd().subtract(pagado);
        return saldo.signum() > 0 ? saldo : BigDecimal.ZERO;
    }

    // ---------- Avisos (campanita): pagos a proveedores pendientes ----------

    public record PagoPendiente(Long compraId, String proveedor, String numeroFactura, LocalDate fecha,
                                LocalDate vence, BigDecimal saldoUsd, boolean vencida, Integer diasPara) {
    }

    @Transactional(readOnly = true)
    public List<PagoPendiente> pagosPendientes() {
        Map<Long, String> nombres = new HashMap<>();
        proveedores.findAll().forEach(p -> nombres.put(p.getId(), p.getNombre()));
        LocalDate hoy = com.kioskpos.web.Fechas.hoy();
        List<PagoPendiente> out = new ArrayList<>();
        for (Compra c : compras.findTop200ByOrderByFechaDescIdDesc()) {
            BigDecimal saldo = saldoDe(c);
            if (saldo.signum() <= 0) {
                continue;
            }
            LocalDate v = c.getVence();
            boolean vencida = v != null && v.isBefore(hoy);
            Integer dias = v == null ? null : (int) java.time.temporal.ChronoUnit.DAYS.between(hoy, v);
            out.add(new PagoPendiente(c.getId(), nombres.get(c.getProveedorId()), c.getNumeroFactura(),
                    c.getFecha(), v, saldo, vencida, dias));
        }
        // Primero las que tienen fecha de pago y están más cerca de vencer (o ya vencidas).
        out.sort((a, b) -> {
            if (a.vence() == null && b.vence() == null) {
                return 0;
            }
            if (a.vence() == null) {
                return 1;
            }
            if (b.vence() == null) {
                return -1;
            }
            return a.vence().compareTo(b.vence());
        });
        return out;
    }

    /** Anula una compra mal cargada: saca del stock lo que entró (si todavía está). */
    @Transactional
    public Compra anular(KioskPrincipal principal, Long id) {
        Compra c = buscar(id);
        if (!"REGISTRADA".equals(c.getEstado())) {
            throw new IllegalStateException("La compra ya está anulada");
        }
        for (CompraDetalle d : detalles.findByCompraIdOrderByIdAsc(id)) {
            if (d.getProductoId() == null) {
                continue;
            }
            Producto p = productos.findById(d.getProductoId()).orElse(null);
            if (p == null) {
                continue;
            }
            if (productos.descontarStock(p.getId(), d.getCantidad()) == 0) {
                throw new IllegalStateException("Ya se vendió parte de \"" + p.getNombre()
                        + "\": no hay stock suficiente para anular la compra. Ajusta el inventario a mano.");
            }
            // Deshace el promedio: costo antes = (stock × costo − cantidad × costo de compra) / (stock − cantidad).
            productos.fijarCosto(p.getId(), costoSinCompra(p.getStockActual(), p.getCostoUsd(), d.getCantidad(), d.getCostoUnitarioUsd()));
            inventario.registrarMovimiento(p, "ANULA_COMPRA", d.getCantidad().negate(), p.getStockActual(),
                    p.getStockActual().subtract(d.getCantidad()), "Compra #" + id, "Compra anulada",
                    principal == null ? null : principal.usuarioId());
        }
        c.setEstado("ANULADA");
        return compras.save(c);
    }

    private Compra buscar(Long id) {
        return compras.findById(id).orElseThrow(() -> new IllegalArgumentException("Compra no encontrada"));
    }

    private static String recortar(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
