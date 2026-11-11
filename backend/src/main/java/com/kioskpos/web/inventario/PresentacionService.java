package com.kioskpos.web.inventario;

import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Presentaciones (bloques) de los productos: caja, media caja, saco, bulto... Cada una
 * dice cuántas unidades trae y a qué precio se vende. Al venderla, el stock baja
 * cantidad × unidades (lo hace VentaService). Todo bajo RLS por negocio.
 */
@Service
public class PresentacionService {

    public static final int MAX_POR_PRODUCTO = 10;

    private final PresentacionRepository presentaciones;
    private final ProductoRepository productos;

    public PresentacionService(PresentacionRepository presentaciones, ProductoRepository productos) {
        this.presentaciones = presentaciones;
        this.productos = productos;
    }

    public record PresentacionVista(Long id, Long productoId, String nombre, BigDecimal cantidad, BigDecimal precioUsd, String codigoBarras) {
        static PresentacionVista de(Presentacion p) {
            return new PresentacionVista(p.getId(), p.getProductoId(), p.getNombre(), p.getCantidad(), p.getPrecioUsd(), p.getCodigoBarras());
        }
    }

    public record PresentacionInput(String nombre, BigDecimal cantidad, BigDecimal precioUsd, String codigoBarras) {
    }

    @Transactional(readOnly = true)
    public List<PresentacionVista> listarTodas() {
        return presentaciones.findAllByOrderByProductoIdAscCantidadAsc().stream().map(PresentacionVista::de).toList();
    }

    @Transactional(readOnly = true)
    public List<PresentacionVista> delProducto(Long productoId) {
        return presentaciones.findByProductoIdOrderByCantidadAsc(productoId).stream().map(PresentacionVista::de).toList();
    }

    /** Reemplaza todas las presentaciones del producto por la lista dada (vacía = solo se vende suelto). */
    @Transactional
    public List<PresentacionVista> guardar(Long productoId, List<PresentacionInput> lista) {
        Producto prod = productos.findById(productoId).orElseThrow(() -> new IllegalArgumentException("Producto no encontrado"));
        List<PresentacionInput> in = lista == null ? List.of() : lista;
        if (in.size() > MAX_POR_PRODUCTO) {
            throw new IllegalArgumentException("Máximo " + MAX_POR_PRODUCTO + " presentaciones por producto");
        }
        Set<String> nombres = new HashSet<>();
        Set<String> codigos = new HashSet<>();
        for (PresentacionInput p : in) {
            String n = p.nombre() == null ? "" : p.nombre().trim();
            if (n.isEmpty()) throw new IllegalArgumentException("Cada presentación necesita un nombre (Ej.: Caja)");
            if (n.length() > 60) throw new IllegalArgumentException("El nombre \"" + n + "\" es muy largo");
            if (!nombres.add(n.toLowerCase(Locale.ROOT))) throw new IllegalArgumentException("Hay dos presentaciones llamadas \"" + n + "\"");
            if (p.cantidad() == null || p.cantidad().signum() <= 0) throw new IllegalArgumentException("\"" + n + "\": la cantidad que trae debe ser mayor a 0");
            if (!prod.isEsPesable() && p.cantidad().stripTrailingZeros().scale() > 0) {
                throw new IllegalArgumentException("\"" + n + "\": la cantidad debe ser un número entero (Ej.: 20)");
            }
            if (p.cantidad().compareTo(BigDecimal.ONE) == 0 && !prod.isEsPesable()) {
                throw new IllegalArgumentException("\"" + n + "\": la unidad suelta ya es el producto; el bloque debe traer más de 1");
            }
            if (p.precioUsd() == null || p.precioUsd().signum() <= 0) throw new IllegalArgumentException("\"" + n + "\": el precio debe ser mayor a 0");
            String cod = p.codigoBarras() == null ? "" : p.codigoBarras().trim();
            if (!cod.isEmpty()) {
                if (cod.equals(prod.getCodigoBarras()) || !codigos.add(cod)) {
                    throw new IllegalArgumentException("\"" + n + "\": el código de barras se repite");
                }
            }
        }
        presentaciones.deleteByProductoId(productoId);
        presentaciones.flush();
        Long negocio = NegocioContext.require();
        for (PresentacionInput p : in) {
            Presentacion e = new Presentacion();
            e.setNegocioId(negocio);
            e.setProductoId(productoId);
            e.setNombre(p.nombre().trim());
            e.setCantidad(p.cantidad().setScale(3, RoundingMode.HALF_UP));
            e.setPrecioUsd(p.precioUsd().setScale(2, RoundingMode.HALF_UP));
            String cod = p.codigoBarras() == null ? "" : p.codigoBarras().trim();
            e.setCodigoBarras(cod.isEmpty() ? null : cod);
            presentaciones.save(e);
        }
        return delProducto(productoId);
    }
}
