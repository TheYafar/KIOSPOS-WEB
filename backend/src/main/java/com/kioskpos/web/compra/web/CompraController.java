package com.kioskpos.web.compra.web;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.compra.Compra;
import com.kioskpos.web.compra.CompraService;
import com.kioskpos.web.compra.Proveedor;
import java.util.List;
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

/** Proveedores y facturas de compra. Solo dueño/encargado (SecurityConfig). */
@RestController
@RequestMapping("/api")
public class CompraController {

    private final CompraService service;

    public CompraController(CompraService service) {
        this.service = service;
    }

    @GetMapping("/proveedores")
    public List<CompraService.ProveedorVista> proveedores() {
        return service.proveedores();
    }

    @PostMapping("/proveedores")
    public Proveedor crearProveedor(@RequestBody CompraService.DatosProveedor d) {
        return service.guardarProveedor(null, d);
    }

    @PutMapping("/proveedores/{id}")
    public Proveedor editarProveedor(@PathVariable Long id, @RequestBody CompraService.DatosProveedor d) {
        return service.guardarProveedor(id, d);
    }

    @GetMapping("/compras")
    public List<CompraService.CompraVista> compras(@RequestParam(required = false) Long proveedorId) {
        return service.listar(proveedorId);
    }

    @GetMapping("/compras/{id}")
    public CompraService.CompraVista compra(@PathVariable Long id) {
        return service.detalle(id);
    }

    @PostMapping("/compras")
    public CompraService.CompraVista registrar(@AuthenticationPrincipal KioskPrincipal p, @RequestBody CompraService.NuevaCompra in) {
        return service.registrar(p, in);
    }

    @PostMapping("/compras/{id}/pagada")
    public Compra pagada(@PathVariable Long id, @RequestParam boolean valor) {
        return service.marcarPagada(id, valor);
    }

    @PostMapping("/compras/{id}/abonos")
    public CompraService.CompraVista abonar(@AuthenticationPrincipal KioskPrincipal p, @PathVariable Long id,
                                            @RequestBody AbonoRequest req) {
        return service.abonar(p, id, req.monto(), req.metodo(), req.nota());
    }

    public record AbonoRequest(java.math.BigDecimal monto, String metodo, String nota) {
    }

    @PostMapping("/compras/{id}/vencimiento")
    public Compra vencimiento(@PathVariable Long id, @RequestBody VencimientoRequest req) {
        return service.fijarVencimiento(id, req.vence());
    }

    public record VencimientoRequest(java.time.LocalDate vence) {
    }

    @GetMapping("/compras/{id}/fotos/{fotoId}")
    public FotoDatos foto(@PathVariable Long id, @PathVariable Long fotoId) {
        var f = service.foto(id, fotoId);
        return new FotoDatos(f.getId(), f.getMime(), f.getDatos());
    }

    public record FotoDatos(Long id, String mime, String datos) {
    }

    @PostMapping("/compras/{id}/fotos")
    public CompraService.FotoMeta subirFoto(@PathVariable Long id, @RequestBody FotoRequest req) {
        return service.guardarFoto(id, req.mime(), req.datos());
    }

    public record FotoRequest(String mime, String datos) {
    }

    @DeleteMapping("/compras/{id}/fotos/{fotoId}")
    public java.util.Map<String, Object> borrarFoto(@PathVariable Long id, @PathVariable Long fotoId) {
        service.borrarFoto(id, fotoId);
        return java.util.Map.of("borrada", true);
    }

    @PostMapping("/compras/{id}/anular")
    public Compra anular(@AuthenticationPrincipal KioskPrincipal p, @PathVariable Long id) {
        return service.anular(p, id);
    }
}
