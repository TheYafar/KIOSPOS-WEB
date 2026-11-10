package com.kioskpos.web.inventario;

import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Categorías del negocio. La lista es la unión de las que creó el dueño (tabla
 * categorias) y las que ya usan sus productos (productos.categoria), con cuántos
 * productos tiene cada una. Renombrar cambia todos sus productos; borrar los pasa a
 * "General".
 */
@Service
public class CategoriaService {

    public static final String GENERAL = "General";

    private final CategoriaRepository categorias;
    private final ProductoRepository productos;

    public CategoriaService(CategoriaRepository categorias, ProductoRepository productos) {
        this.categorias = categorias;
        this.productos = productos;
    }

    public record CategoriaVista(String nombre, long productos) {
    }

    @Transactional(readOnly = true)
    public List<CategoriaVista> listar() {
        Map<String, CategoriaVista> m = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        m.put(GENERAL, new CategoriaVista(GENERAL, 0));
        for (Categoria c : categorias.findAllByOrderByNombreAsc()) {
            m.put(c.getNombre(), new CategoriaVista(c.getNombre(), 0));
        }
        for (Object[] r : productos.contarPorCategoria()) {
            String n = r[0] == null ? GENERAL : r[0].toString();
            long cant = ((Number) r[1]).longValue();
            CategoriaVista prev = m.get(n);
            m.put(prev == null ? n : prev.nombre(), new CategoriaVista(prev == null ? n : prev.nombre(), cant));
        }
        return List.copyOf(m.values());
    }

    @Transactional
    public CategoriaVista crear(String nombre) {
        String n = limpiar(nombre);
        if (GENERAL.equalsIgnoreCase(n) || categorias.findFirstByNombreIgnoreCase(n).isPresent()) {
            throw new IllegalArgumentException("Ya existe la categoría \"" + n + "\"");
        }
        Categoria c = new Categoria();
        c.setNegocioId(NegocioContext.require());
        c.setNombre(n);
        categorias.save(c);
        return new CategoriaVista(n, 0);
    }

    /** Cambia el nombre de una categoría y de todos sus productos. */
    @Transactional
    public CategoriaVista renombrar(String de, String a) {
        String viejo = limpiar(de);
        String nuevo = limpiar(a);
        if (GENERAL.equalsIgnoreCase(viejo)) {
            throw new IllegalArgumentException("\"General\" no se puede renombrar");
        }
        if (!viejo.equalsIgnoreCase(nuevo) && (GENERAL.equalsIgnoreCase(nuevo) || categorias.findFirstByNombreIgnoreCase(nuevo).isPresent())) {
            throw new IllegalArgumentException("Ya existe la categoría \"" + nuevo + "\"");
        }
        Categoria c = categorias.findFirstByNombreIgnoreCase(viejo).orElseGet(() -> {
            Categoria x = new Categoria();
            x.setNegocioId(NegocioContext.require());
            return x;
        });
        c.setNombre(nuevo);
        categorias.save(c);
        int n = productos.renombrarCategoria(viejo, nuevo);
        return new CategoriaVista(nuevo, n);
    }

    /** Borra la categoría; sus productos quedan en "General". */
    @Transactional
    public void borrar(String nombre) {
        String n = limpiar(nombre);
        if (GENERAL.equalsIgnoreCase(n)) {
            throw new IllegalArgumentException("\"General\" no se puede borrar");
        }
        productos.renombrarCategoria(n, GENERAL);
        categorias.findFirstByNombreIgnoreCase(n).ifPresent(categorias::delete);
    }

    /** Si un producto usa una categoría nueva escrita a mano, queda en la lista. */
    @Transactional
    public void asegurar(String nombre) {
        if (nombre == null || nombre.isBlank() || GENERAL.equalsIgnoreCase(nombre.trim())) {
            return;
        }
        if (categorias.findFirstByNombreIgnoreCase(nombre.trim()).isEmpty()) {
            Categoria c = new Categoria();
            c.setNegocioId(NegocioContext.require());
            c.setNombre(limpiar(nombre));
            categorias.save(c);
        }
    }

    private static String limpiar(String s) {
        String t = s == null ? "" : s.trim().replaceAll("\\s+", " ");
        if (t.isEmpty()) {
            throw new IllegalArgumentException("Escribe el nombre de la categoría");
        }
        if (t.length() > 60) {
            t = t.substring(0, 60);
        }
        // Primera letra en mayúscula: "víveres" → "Víveres".
        return t.substring(0, 1).toUpperCase(Locale.ROOT) + t.substring(1);
    }
}
