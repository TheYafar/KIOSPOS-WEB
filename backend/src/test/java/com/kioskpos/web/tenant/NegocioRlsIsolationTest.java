package com.kioskpos.web.tenant;

import static org.assertj.core.api.Assertions.assertThat;

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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Prueba de la regla dura del CLAUDE.md: "una bodega no puede leer los datos de
 * otra". Usa un Postgres 16 real vía Testcontainers (no H2: Row Level Security es
 * una característica real de Postgres, no se puede simular).
 *
 * <p>El datasource de la app en este test se conecta como {@code kioskpos_app}
 * (creado por db/init/01-create-app-role.sql, sin privilegios de superusuario ni
 * de propietario), exactamente como en dev/producción — si esta prueba conectara
 * como superusuario, Row Level Security se saltaría silenciosamente y la prueba
 * daría una falsa sensación de seguridad.
 */
@Testcontainers
@SpringBootTest
class NegocioRlsIsolationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16")
            .withDatabaseName("kioskpos")
            .withUsername("kioskpos_admin")
            .withPassword("kioskpos_admin_dev")
            .withInitScript("db/init/01-create-app-role.sql");

    @DynamicPropertySource
    static void overridePostgresProperties(DynamicPropertyRegistry registry) {
        // Datasource de runtime: el rol limitado, igual que en dev/producción.
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", () -> "kioskpos_app");
        registry.add("spring.datasource.password", () -> "kioskpos_app_dev");

        // Datasource de Flyway: el rol administrativo, dueño de las tablas.
        registry.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
    }

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
