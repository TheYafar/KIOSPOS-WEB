package com.kioskpos.web.tenant;

import static org.assertj.core.api.Assertions.assertThat;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Regla dura del CLAUDE.md: "una bodega no puede leer los datos de otra". Prueba la
 * barrera de base de datos (Row Level Security) directamente sobre productos.
 */
@SpringBootTest
class NegocioRlsIsolationTest extends PostgresRlsTestBase {

    @Autowired
    private NegocioRepository negocioRepository;

    @Autowired
    private ProductoRepository productoRepository;

    @AfterEach
    void limpiarContexto() {
        NegocioContext.clear();
    }

    @Test
    void unaBodegaNoPuedeLeerLosProductosDeOtraBodega() {
        Negocio bodegaCocoa = negocioRepository.save(negocio("Bodega Cocoa"));
        Negocio bodegaLaEsquina = negocioRepository.save(negocio("Bodega La Esquina"));

        NegocioContext.set(bodegaCocoa.getId());
        Producto harinaPan = productoRepository.save(producto(bodegaCocoa.getId(), "A-001", "Harina PAN"));

        NegocioContext.set(bodegaLaEsquina.getId());
        Producto arrozMary = productoRepository.save(producto(bodegaLaEsquina.getId(), "B-001", "Arroz Mary"));

        // Bodega Cocoa: la consulta no filtra por negocio_id en Java (findAll() es
        // un SELECT * sin WHERE) y aun así solo ve su propio producto.
        NegocioContext.set(bodegaCocoa.getId());
        List<Producto> visiblesParaCocoa = productoRepository.findAll();
        assertThat(visiblesParaCocoa).extracting(Producto::getNombre).containsExactly("Harina PAN");

        // Aunque Cocoa conozca el ID exacto del producto de La Esquina, no puede leerlo.
        Optional<Producto> intentoLeerProductoAjeno = productoRepository.findById(arrozMary.getId());
        assertThat(intentoLeerProductoAjeno).isEmpty();

        // Simétricamente, La Esquina solo ve lo suyo.
        NegocioContext.set(bodegaLaEsquina.getId());
        List<Producto> visiblesParaLaEsquina = productoRepository.findAll();
        assertThat(visiblesParaLaEsquina).extracting(Producto::getNombre).containsExactly("Arroz Mary");

        // Fail-closed: si por un bug nadie fija negocio_id en el contexto, cero
        // filas — nunca "todas las filas".
        NegocioContext.clear();
        assertThat(productoRepository.findAll()).isEmpty();
        assertThat(productoRepository.findById(harinaPan.getId())).isEmpty();
    }

    private Negocio negocio(String nombre) {
        Negocio negocio = new Negocio();
        negocio.setNombre(nombre);
        negocio.setEstado("ACTIVA");
        return negocio;
    }

    private Producto producto(Long negocioId, String codigoBarras, String nombre) {
        Producto producto = new Producto();
        producto.setNegocioId(negocioId);
        producto.setCodigoBarras(codigoBarras);
        producto.setNombre(nombre);
        producto.setPrecioUsd(new BigDecimal("1.50"));
        producto.setStockActual(BigDecimal.TEN);
        producto.setActivo(true);
        return producto;
    }
}
