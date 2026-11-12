package com.kioskpos.web.cliente.web;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cliente.ClienteService;
import com.kioskpos.web.cliente.MovimientoCliente;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Fiado. Ver y crear clientes y recibir abonos: cualquier usuario del negocio (el cajero
 * lo hace en el mostrador). Cambiar límite o desactivar: solo dueño/encargado (SecurityConfig).
 */
@RestController
@RequestMapping("/api/clientes")
public class ClienteController {

    private final ClienteService service;
    private final com.kioskpos.web.venta.VentaService ventaService;

    public ClienteController(ClienteService service, com.kioskpos.web.venta.VentaService ventaService) {
        this.service = service;
        this.ventaService = ventaService;
    }

    /** Fiar productos directo desde el perfil del cliente/trabajador (baja stock; queda en su cuenta). */
    @PostMapping("/{id}/fiar")
    public FiadoHecho fiar(@AuthenticationPrincipal KioskPrincipal p, @PathVariable Long id, @RequestBody FiarRequest req) {
        var v = ventaService.fiarDesdeLibreta(p, id, req.tasa(),
                req.items() == null ? List.of() : req.items().stream()
                        .map(i -> new com.kioskpos.web.venta.VentaService.ItemInput(i.productoId(), i.cantidad(), null, null, i.presentacionId())).toList());
        return new FiadoHecho(v.getId(), v.getNumeroFactura(), v.getTotalUsd(), v.getTotalBs());
    }

    public record ItemFiar(Long productoId, java.math.BigDecimal cantidad, Long presentacionId) {
    }

    public record FiarRequest(java.math.BigDecimal tasa, List<ItemFiar> items) {
    }

    public record FiadoHecho(Long ventaId, Integer numeroFactura, java.math.BigDecimal totalUsd, java.math.BigDecimal totalBs) {
    }

    @org.springframework.beans.factory.annotation.Autowired
    private com.kioskpos.web.cliente.TrabajadorSyncService trabajadorSync;

    @GetMapping
    public List<ClienteService.ClienteVista> listar(@RequestParam(required = false) String q,
                                                    @RequestParam(required = false) String tipo) {
        trabajadorSync.asegurar(); // el personal del sistema también aparece como trabajador
        return service.listar(q, tipo);
    }

    @GetMapping("/{id}")
    public ClienteService.Detalle detalle(@PathVariable Long id) {
        return service.detalle(id);
    }

    @PostMapping
    public ClienteService.ClienteVista crear(@AuthenticationPrincipal KioskPrincipal p, @RequestBody ClienteService.Datos d) {
        // El cajero puede anotar un cliente nuevo, pero el límite lo pone el dueño.
        boolean jefe = p != null && (p.rol().name().equals("DUENO") || p.rol().name().equals("ENCARGADO"));
        // ...y a los trabajadores (con su sueldo) también los anota el dueño.
        return service.crear(jefe ? d : new ClienteService.Datos(d.nombre(), d.cedula(), d.telefono(), null, null, "CLIENTE", null));
    }

    /** El dueño descuenta del sueldo de un trabajador lo que debe (SecurityConfig: solo dueño/encargado). */
    @PostMapping("/{id}/descuento-sueldo")
    public MovimientoCliente descontarDelSueldo(@AuthenticationPrincipal KioskPrincipal p, @PathVariable Long id,
                                                @RequestBody DescuentoRequest req) {
        return service.descontarDelSueldo(p, id, req.montoUsd(), req.nota());
    }

    public record DescuentoRequest(java.math.BigDecimal montoUsd, String nota) {
    }

    @PutMapping("/{id}")
    public ClienteService.ClienteVista actualizar(@PathVariable Long id, @RequestBody ClienteService.Datos d) {
        return service.actualizar(id, d);
    }

    @PostMapping("/{id}/abonos")
    public MovimientoCliente abonar(@AuthenticationPrincipal KioskPrincipal p, @PathVariable Long id,
                                    @RequestBody ClienteService.Abono a) {
        return service.abonar(p, id, a);
    }
}
