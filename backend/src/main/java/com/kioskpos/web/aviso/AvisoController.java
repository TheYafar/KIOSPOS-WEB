package com.kioskpos.web.aviso;

import com.kioskpos.web.compra.CompraService;
import com.kioskpos.web.inventario.InventarioService;
import com.kioskpos.web.producto.Producto;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Campanita de avisos del dueño: pagos pendientes a proveedores (con su fecha de pago) y
 * productos bajo stock o agotados. Solo dueño/encargado (SecurityConfig).
 */
@RestController
@RequestMapping("/api/avisos")
public class AvisoController {

    private final CompraService compras;
    private final InventarioService inventario;

    public AvisoController(CompraService compras, InventarioService inventario) {
        this.compras = compras;
        this.inventario = inventario;
    }

    public record AvisoStock(Long productoId, String nombre, BigDecimal stock, BigDecimal minimo,
                             String unidad, boolean agotado) {
    }

    public record Avisos(List<CompraService.PagoPendiente> pagos, List<AvisoStock> stock,
                         int pagosVencidos, int agotados, int bajos) {
    }

    @GetMapping
    public Avisos avisos() {
        List<CompraService.PagoPendiente> pagos = compras.pagosPendientes();
        int vencidos = (int) pagos.stream().filter(CompraService.PagoPendiente::vencida).count();

        List<AvisoStock> stock = inventario.listar().stream()
                .filter(p -> p.getStockMinimo().signum() > 0
                        ? p.getStockActual().compareTo(p.getStockMinimo()) <= 0
                        : p.getStockActual().signum() <= 0)
                .map(p -> new AvisoStock(p.getId(), p.getNombre(), p.getStockActual(), p.getStockMinimo(),
                        p.getUnidadMedida(), p.getStockActual().signum() <= 0))
                .toList();
        int agotados = (int) stock.stream().filter(AvisoStock::agotado).count();

        return new Avisos(pagos, stock, vencidos, agotados, stock.size() - agotados);
    }
}
