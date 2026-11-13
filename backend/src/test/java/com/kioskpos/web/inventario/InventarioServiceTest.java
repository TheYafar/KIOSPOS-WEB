package com.kioskpos.web.inventario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.inventario.InventarioService.DatosProducto;
import com.kioskpos.web.inventario.InventarioService.TipoAjuste;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Inventario (Paso 6): crear, ajustar stock, importar CSV y borrar para siempre,
 * siempre aislado por negocio (RLS).
 */
@SpringBootTest
class InventarioServiceTest extends PostgresRlsTestBase {

    @Autowired
    private NegocioRegistroService negocioRegistroService;
    @Autowired
    private InventarioService inventarioService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private Long negocio(String nombre, String email) {
        return negocioRegistroService
                .registrarNegocioConDueno(nombre, "Dueño", email, "clave-secreta").negocioId();
    }

    private DatosProducto datos(String codigo, String nombre, String precio, String stock) {
        return new DatosProducto(codigo, nombre, new BigDecimal(precio), BigDecimal.ONE,
                "General", new BigDecimal(stock), false, "UND", BigDecimal.ZERO);
    }

    @Test
    void crearYAjustarStock() {
        Long neg = negocio("Cocoa", "inv1@ejemplo.com");
        try {
            NegocioContext.set(neg);
            Producto p = inventarioService.crear(datos("A-1", "Harina PAN", "2.00", "10"));
            assertThat(p.getStockActual()).isEqualByComparingTo("10");

            inventarioService.ajustarStock(p.getId(), TipoAjuste.ENTRADA, new BigDecimal("5"), "compra", null);
            inventarioService.ajustarStock(p.getId(), TipoAjuste.SALIDA, new BigDecimal("3"), "merma", null);
            Producto fijado = inventarioService.ajustarStock(p.getId(), TipoAjuste.FIJAR, new BigDecimal("20"), "conteo", null);
            assertThat(fijado.getStockActual()).isEqualByComparingTo("20");

            assertThatThrownBy(() -> inventarioService.ajustarStock(
                    p.getId(), TipoAjuste.SALIDA, new BigDecimal("999"), "x", null))
                    .isInstanceOf(IllegalStateException.class);
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void importarCsvHaceUpsert() {
        Long neg = negocio("Cocoa", "inv2@ejemplo.com");
        String csv = """
                codigo_barras,nombre,precio_usd,costo_usd,categoria,stock,stock_minimo
                B-1,Arroz,1.50,1.00,Viveres,30,5
                B-2,Azucar,2.00,1.50,Viveres,40,5
                """;
        try {
            NegocioContext.set(neg);
            var r1 = inventarioService.importarCsv(csv);
            assertThat(r1.creados()).isEqualTo(2);
            assertThat(r1.actualizados()).isZero();
            // El stock y el mínimo no se intercambian: stock=30, stock_minimo=5.
            Producto arroz = inventarioService.buscar("B-1").stream().findFirst().orElseThrow();
            assertThat(arroz.getStockActual()).isEqualByComparingTo("30");
            assertThat(arroz.getStockMinimo()).isEqualByComparingTo("5");

            // Reimportar con precio cambiado -> actualiza, no duplica.
            String csv2 = "codigo_barras,nombre,precio_usd,costo_usd,categoria,stock,stock_minimo\nB-1,Arroz,1.80,1.00,Viveres,30,5\n";
            var r2 = inventarioService.importarCsv(csv2);
            assertThat(r2.creados()).isZero();
            assertThat(r2.actualizados()).isEqualTo(1);
            assertThat(inventarioService.listar()).hasSize(2);
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void borrarProductoParaSiempre() {
        Long neg = negocio("Cocoa", "inv3@ejemplo.com");
        try {
            NegocioContext.set(neg);
            Producto p = inventarioService.crear(datos("C-1", "Chupeta", "0.50", "100"));
            inventarioService.eliminar(p.getId());
            assertThat(inventarioService.listar()).isEmpty();
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void vaciarBorraTodoElInventario() {
        Long neg = negocio("Cocoa", "inv6@ejemplo.com");
        try {
            NegocioContext.set(neg);
            inventarioService.crear(datos("V-1", "Uno", "1.00", "5"));
            inventarioService.crear(datos("V-2", "Dos", "2.00", "3"));
            assertThat(inventarioService.listar()).hasSize(2);
            assertThat(inventarioService.eliminarTodo()).isEqualTo(2);
            assertThat(inventarioService.listar()).isEmpty();
            assertThat(inventarioService.eliminarTodo()).isZero(); // vaciar de nuevo no falla
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void inventarioAisladoPorNegocio() {
        Long cocoa = negocio("Cocoa", "inv4@ejemplo.com");
        Long esquina = negocio("La Esquina", "inv5@ejemplo.com");
        try {
            NegocioContext.set(cocoa);
            inventarioService.crear(datos("D-1", "Solo Cocoa", "1.00", "5"));
        } finally {
            NegocioContext.clear();
        }
        try {
            NegocioContext.set(esquina);
            assertThat(inventarioService.listar()).isEmpty(); // no ve lo de Cocoa
        } finally {
            NegocioContext.clear();
        }
    }
}
