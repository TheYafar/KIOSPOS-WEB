package com.kioskpos.web.inventario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.inventario.InventarioService.DatosProducto;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Categorías: crear, ver cuántos productos tiene cada una, renombrar y borrar. */
@SpringBootTest
class CategoriaServiceTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private InventarioService inventarioService;
    @Autowired private CategoriaService categoriaService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    @Test
    void crearRenombrarYBorrarCategorias() {
        Long neg = negocioRegistroService.registrarNegocioConDueno("Cat", "Dueño", "cat@ejemplo.com", "clave-secreta").negocioId();
        Long otro = negocioRegistroService.registrarNegocioConDueno("Cat2", "Dueño", "cat2@ejemplo.com", "clave-secreta").negocioId();
        try {
            NegocioContext.set(neg);
            categoriaService.crear("  charcutería ");
            assertThatThrownBy(() -> categoriaService.crear("Charcutería")).isInstanceOf(IllegalArgumentException.class);
            inventarioService.crear(new DatosProducto("Q-1", "Queso", new BigDecimal("6"), BigDecimal.ONE, "Charcutería",
                    new BigDecimal("5"), true, "KG", BigDecimal.ZERO));
            inventarioService.crear(new DatosProducto("H-1", "Harina", new BigDecimal("1"), BigDecimal.ONE, null,
                    new BigDecimal("5"), false, "UND", BigDecimal.ZERO));

            var lista = categoriaService.listar();
            assertThat(lista).extracting(CategoriaService.CategoriaVista::nombre).containsExactly("Charcutería", "General");
            assertThat(lista.get(0).productos()).isEqualTo(1);

            categoriaService.renombrar("Charcutería", "Fiambrería");
            assertThat(inventarioService.buscar("Queso").get(0).getCategoria()).isEqualTo("Fiambrería");
            categoriaService.borrar("Fiambrería");
            assertThat(inventarioService.buscar("Queso").get(0).getCategoria()).isEqualTo("General");
            assertThat(categoriaService.listar()).extracting(CategoriaService.CategoriaVista::nombre).containsExactly("General");
            assertThatThrownBy(() -> categoriaService.borrar("General")).isInstanceOf(IllegalArgumentException.class);
        } finally {
            NegocioContext.clear();
        }
        try {
            NegocioContext.set(otro);
            assertThat(categoriaService.listar()).extracting(CategoriaService.CategoriaVista::nombre).containsExactly("General");
        } finally {
            NegocioContext.clear();
        }
    }
}
