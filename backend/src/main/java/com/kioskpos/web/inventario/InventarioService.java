package com.kioskpos.web.inventario;

import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import com.kioskpos.web.venta.DetalleVentaRepository;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inventario del negocio de la sesión (bajo RLS). CRUD de productos, ajuste de stock
 * con bitácora, importación por CSV y borrado "para siempre" (portado del escritorio:
 * el historial de ventas se conserva porque cada línea ya guarda el nombre y el monto).
 */
@Service
public class InventarioService {

    public enum TipoAjuste { ENTRADA, SALIDA, FIJAR }

    private final ProductoRepository productoRepository;
    private final MovimientoInventarioRepository movimientoRepository;
    private final DetalleVentaRepository detalleVentaRepository;

    public InventarioService(ProductoRepository productoRepository,
                             MovimientoInventarioRepository movimientoRepository,
                             DetalleVentaRepository detalleVentaRepository) {
        this.productoRepository = productoRepository;
        this.movimientoRepository = movimientoRepository;
        this.detalleVentaRepository = detalleVentaRepository;
    }

    @Transactional(readOnly = true)
    public List<Producto> listar() {
        return productoRepository.findByActivoTrueOrderByNombreAsc();
    }

    @Transactional(readOnly = true)
    public List<Producto> buscar(String q) {
        if (q == null || q.isBlank()) {
            return listar();
        }
        return productoRepository.buscar(q.trim());
    }

    @Transactional
    public Producto crear(DatosProducto datos) {
        validar(datos);
        String codigo = datos.codigoBarras().trim();
        if (productoRepository.findByCodigoBarras(codigo).isPresent()) {
            throw new IllegalArgumentException("Ya existe un producto con el código '" + codigo + "'");
        }
        Producto p = new Producto();
        p.setNegocioId(NegocioContext.require());
        aplicar(p, datos);
        p.setStockActual(datos.stockInicial() == null ? BigDecimal.ZERO : datos.stockInicial());
        p.setActivo(true);
        p = productoRepository.save(p);
        if (p.getStockActual().signum() > 0) {
            registrarMovimiento(p, "ALTA", p.getStockActual(), BigDecimal.ZERO, p.getStockActual(),
                    null, "Stock inicial", null);
        }
        return p;
    }

    @Transactional
    public Producto actualizar(Long id, DatosProducto datos) {
        validar(datos);
        Producto p = cargar(id);
        aplicar(p, datos);
        return productoRepository.save(p);
    }

    /** Ajusta el stock (entrada/salida/fijar) y deja un movimiento en la bitácora. */
    @Transactional
    public Producto ajustarStock(Long id, TipoAjuste tipo, BigDecimal cantidad, String motivo, Long usuarioId) {
        if (cantidad == null || cantidad.signum() < 0) {
            throw new IllegalArgumentException("La cantidad no puede ser negativa");
        }
        Producto p = cargar(id);
        BigDecimal previo = p.getStockActual();
        BigDecimal posterior;
        switch (tipo) {
            case ENTRADA -> posterior = previo.add(cantidad);
            case SALIDA -> {
                if (previo.compareTo(cantidad) < 0) {
                    throw new IllegalStateException("No hay suficiente stock para descontar");
                }
                posterior = previo.subtract(cantidad);
            }
            case FIJAR -> posterior = cantidad;
            default -> throw new IllegalArgumentException("Tipo de ajuste no soportado");
        }
        p.setStockActual(posterior);
        productoRepository.save(p);
        registrarMovimiento(p, "AJUSTE_" + tipo.name(), posterior.subtract(previo), previo, posterior,
                null, motivo, usuarioId);
        return p;
    }

    /**
     * Borra un producto PARA SIEMPRE. Primero lo desenlaza de las líneas de venta (que
     * conservan su nombre y monto) y luego lo elimina; sus movimientos caen por cascada.
     */
    @Transactional
    public void eliminar(Long id) {
        Producto p = cargar(id);
        detalleVentaRepository.desenlazarProducto(p.getId());
        productoRepository.delete(p);
    }

    /**
     * Importa productos desde CSV (upsert por código de barras). Cabecera esperada:
     * codigo_barras,nombre,precio_usd,costo_usd,categoria,stock,stock_minimo. Devuelve
     * cuántos se crearon y cuántos se actualizaron.
     */
    @Transactional
    public ResultadoImport importarCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            throw new IllegalArgumentException("El archivo CSV está vacío");
        }
        String[] lineas = csv.replace("\r\n", "\n").replace("\r", "\n").split("\n");
        int creados = 0;
        int actualizados = 0;
        boolean primera = true;
        for (String raw : lineas) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            String[] c = raw.split(",", -1);
            // Saltar la cabecera si la primera celda no parece un dato (contiene "codigo").
            if (primera) {
                primera = false;
                if (c[0].toLowerCase().contains("codigo")) {
                    continue;
                }
            }
            if (c.length < 3 || c[0].isBlank()) {
                continue;
            }
            String codigo = c[0].trim();
            DatosProducto datos = new DatosProducto(
                    codigo,
                    c[1].trim(),
                    num(c, 2),
                    num(c, 3),
                    celda(c, 4, "General"),
                    num(c, 6),
                    false,
                    "UND",
                    num(c, 5));
            Producto existente = productoRepository.findByCodigoBarras(codigo).orElse(null);
            if (existente == null) {
                crear(datos);
                creados++;
            } else {
                aplicar(existente, datos);
                productoRepository.save(existente);
                actualizados++;
            }
        }
        return new ResultadoImport(creados, actualizados);
    }

    private void registrarMovimiento(Producto p, String tipo, BigDecimal cantidad,
                                     BigDecimal previo, BigDecimal posterior,
                                     String referencia, String descripcion, Long usuarioId) {
        MovimientoInventario m = new MovimientoInventario();
        m.setNegocioId(p.getNegocioId());
        m.setProductoId(p.getId());
        m.setTipo(tipo);
        m.setCantidad(cantidad);
        m.setStockPrevio(previo);
        m.setStockPosterior(posterior);
        m.setReferencia(referencia);
        m.setDescripcion(descripcion);
        m.setUsuarioId(usuarioId);
        movimientoRepository.save(m);
    }

    private Producto cargar(Long id) {
        return productoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Producto no encontrado"));
    }

    private void validar(DatosProducto d) {
        if (d.codigoBarras() == null || d.codigoBarras().isBlank()) {
            throw new IllegalArgumentException("El código de barras es obligatorio");
        }
        if (d.nombre() == null || d.nombre().isBlank()) {
            throw new IllegalArgumentException("El nombre es obligatorio");
        }
        if (d.precioUsd() == null || d.precioUsd().signum() < 0) {
            throw new IllegalArgumentException("El precio no puede ser negativo");
        }
    }

    private void aplicar(Producto p, DatosProducto d) {
        p.setCodigoBarras(d.codigoBarras().trim());
        p.setNombre(d.nombre().trim());
        p.setPrecioUsd(d.precioUsd());
        p.setCostoUsd(d.costoUsd() == null ? BigDecimal.ZERO : d.costoUsd());
        p.setCategoria(d.categoria() == null || d.categoria().isBlank() ? "General" : d.categoria().trim());
        p.setStockMinimo(d.stockMinimo() == null ? BigDecimal.ZERO : d.stockMinimo());
        p.setEsPesable(d.esPesable());
        p.setUnidadMedida(d.unidadMedida() == null || d.unidadMedida().isBlank() ? "UND" : d.unidadMedida().trim());
    }

    private static BigDecimal num(String[] c, int i) {
        if (i >= c.length || c[i] == null || c[i].isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(c[i].trim().replace(",", "."));
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private static String celda(String[] c, int i, String porDefecto) {
        return (i < c.length && c[i] != null && !c[i].isBlank()) ? c[i].trim() : porDefecto;
    }

    public record DatosProducto(String codigoBarras, String nombre, BigDecimal precioUsd, BigDecimal costoUsd,
                                String categoria, BigDecimal stockInicial, boolean esPesable,
                                String unidadMedida, BigDecimal stockMinimo) {
    }

    public record ResultadoImport(int creados, int actualizados) {
    }
}
