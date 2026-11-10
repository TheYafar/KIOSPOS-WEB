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
    private final ProductoRepository productos;
    private final InventarioService inventario;

    public CompraService(ProveedorRepository proveedores, CompraRepository compras, CompraDetalleRepository detalles,
                         ProductoRepository productos, InventarioService inventario) {
        this.proveedores = proveedores;
        this.compras = compras;
        this.detalles = detalles;
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
            if (!c.isPagada()) {
                deuda.merge(c.getProveedorId(), c.getTotalUsd(), BigDecimal::add);
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

    public record NuevaCompra(Long proveedorId, String numeroFactura, LocalDate fecha, BigDecimal tasa, Boolean pagada,
                              String nota, List<ItemCompra> items) {
    }

    public record CompraVista(Compra compra, String proveedor, List<CompraDetalle> detalles) {
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
        c.setFecha(in.fecha() == null ? LocalDate.now() : in.fecha());
        c.setTasa(in.tasa());
        c.setPagada(in.pagada() == null || in.pagada());
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
        compras.save(c);
        return new CompraVista(c, proveedorNombre, lineas);
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

    @Transactional(readOnly = true)
    public List<CompraVista> listar(Long proveedorId) {
        Map<Long, String> nombres = new HashMap<>();
        proveedores.findAll().forEach(p -> nombres.put(p.getId(), p.getNombre()));
        List<Compra> l = proveedorId == null ? compras.findTop200ByOrderByFechaDescIdDesc()
                : compras.findByProveedorIdOrderByFechaDescIdDesc(proveedorId);
        return l.stream().map(c -> new CompraVista(c, nombres.get(c.getProveedorId()), List.of())).toList();
    }

    @Transactional(readOnly = true)
    public CompraVista detalle(Long id) {
        Compra c = buscar(id);
        String prov = c.getProveedorId() == null ? null
                : proveedores.findById(c.getProveedorId()).map(Proveedor::getNombre).orElse(null);
        return new CompraVista(c, prov, detalles.findByCompraIdOrderByIdAsc(id));
    }

    @Transactional
    public Compra marcarPagada(Long id, boolean pagada) {
        Compra c = buscar(id);
        c.setPagada(pagada);
        return compras.save(c);
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
