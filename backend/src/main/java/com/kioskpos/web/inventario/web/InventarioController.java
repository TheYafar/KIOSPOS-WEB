package com.kioskpos.web.inventario.web;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.inventario.InventarioService;
import com.kioskpos.web.producto.Producto;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inventario")
public class InventarioController {

    private final InventarioService inventarioService;
    private final com.kioskpos.web.inventario.CategoriaService categoriaService;
    private final com.kioskpos.web.inventario.PresentacionService presentacionService;

    public InventarioController(InventarioService inventarioService,
                                com.kioskpos.web.inventario.CategoriaService categoriaService,
                                com.kioskpos.web.inventario.PresentacionService presentacionService) {
        this.inventarioService = inventarioService;
        this.categoriaService = categoriaService;
        this.presentacionService = presentacionService;
    }

    // ---- Presentaciones / bloques (leer: todos, la caja las necesita; guardar: dueño o encargado) ----

    @GetMapping("/presentaciones")
    public List<com.kioskpos.web.inventario.PresentacionService.PresentacionVista> presentaciones() {
        return presentacionService.listarTodas();
    }

    @PutMapping("/productos/{id}/presentaciones")
    public List<com.kioskpos.web.inventario.PresentacionService.PresentacionVista> guardarPresentaciones(
            @PathVariable Long id, @RequestBody List<com.kioskpos.web.inventario.PresentacionService.PresentacionInput> lista) {
        return presentacionService.guardar(id, lista);
    }

    // ---- Categorías (leer: todos; crear/renombrar/borrar: dueño o encargado por SecurityConfig) ----

    @GetMapping("/categorias")
    public List<com.kioskpos.web.inventario.CategoriaService.CategoriaVista> categorias() {
        return categoriaService.listar();
    }

    @PostMapping("/categorias")
    public com.kioskpos.web.inventario.CategoriaService.CategoriaVista crearCategoria(@RequestBody CategoriaRequest req) {
        return categoriaService.crear(req.nombre());
    }

    @PutMapping("/categorias")
    public com.kioskpos.web.inventario.CategoriaService.CategoriaVista renombrarCategoria(@RequestBody RenombrarRequest req) {
        return categoriaService.renombrar(req.de(), req.a());
    }

    @DeleteMapping("/categorias")
    public Map<String, Object> borrarCategoria(@RequestParam String nombre) {
        categoriaService.borrar(nombre);
        return Map.of("borrada", true);
    }

    public record CategoriaRequest(String nombre) {
    }

    public record RenombrarRequest(String de, String a) {
    }

    @GetMapping("/productos")
    public List<ProductoResponse> listar(@RequestParam(value = "q", required = false) String q) {
        return inventarioService.buscar(q).stream().map(ProductoResponse::de).toList();
    }

    @PostMapping("/productos")
    public ProductoResponse crear(@RequestBody ProductoRequest req) {
        categoriaService.asegurar(req.aDatos().categoria());
        return ProductoResponse.de(inventarioService.crear(req.aDatos()));
    }

    @PutMapping("/productos/{id}")
    public ProductoResponse actualizar(@PathVariable Long id, @RequestBody ProductoRequest req) {
        categoriaService.asegurar(req.aDatos().categoria());
        return ProductoResponse.de(inventarioService.actualizar(id, req.aDatos()));
    }

    @DeleteMapping("/productos/{id}")
    public Map<String, Object> eliminar(@PathVariable Long id) {
        inventarioService.eliminar(id);
        return Map.of("eliminado", true);
    }

    /** Borra TODO el inventario del negocio (para empezar de cero). Solo dueño/encargado. */
    @DeleteMapping("/productos")
    public Map<String, Object> vaciar() {
        return Map.of("borrados", inventarioService.eliminarTodo());
    }

    @PostMapping("/productos/{id}/ajuste")
    public ProductoResponse ajustar(@PathVariable Long id,
                                    @AuthenticationPrincipal KioskPrincipal principal,
                                    @RequestBody AjusteRequest req) {
        return ProductoResponse.de(inventarioService.ajustarStock(
                id, req.tipo(), req.cantidad(), req.motivo(), principal.usuarioId()));
    }

    /** CSV en el cuerpo (text/plain o text/csv). Upsert por código de barras. */
    @PostMapping("/importar")
    public InventarioService.ResultadoImport importar(@RequestBody String csv) {
        return inventarioService.importarCsv(csv);
    }

    public record ProductoRequest(
            @NotBlank String codigoBarras,
            @NotBlank String nombre,
            @NotNull BigDecimal precioUsd,
            BigDecimal costoUsd,
            String categoria,
            BigDecimal stockInicial,
            boolean esPesable,
            String unidadMedida,
            BigDecimal stockMinimo) {
        InventarioService.DatosProducto aDatos() {
            return new InventarioService.DatosProducto(codigoBarras, nombre, precioUsd, costoUsd,
                    categoria, stockInicial, esPesable, unidadMedida, stockMinimo);
        }
    }

    public record AjusteRequest(@NotNull InventarioService.TipoAjuste tipo,
                                @NotNull BigDecimal cantidad, String motivo) {
    }

    public record ProductoResponse(Long id, String codigoBarras, String nombre, BigDecimal precioUsd,
                                   BigDecimal costoUsd, String categoria, BigDecimal stockActual,
                                   BigDecimal stockMinimo, boolean esPesable, String unidadMedida, boolean activo) {
        static ProductoResponse de(Producto p) {
            return new ProductoResponse(p.getId(), p.getCodigoBarras(), p.getNombre(), p.getPrecioUsd(),
                    p.getCostoUsd(), p.getCategoria(), p.getStockActual(), p.getStockMinimo(),
                    p.isEsPesable(), p.getUnidadMedida(), p.isActivo());
        }
    }
}
