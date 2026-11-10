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

    public ClienteController(ClienteService service) {
        this.service = service;
    }

    @GetMapping
    public List<ClienteService.ClienteVista> listar(@RequestParam(required = false) String q) {
        return service.listar(q);
    }

    @GetMapping("/{id}")
    public ClienteService.Detalle detalle(@PathVariable Long id) {
        return service.detalle(id);
    }

    @PostMapping
    public ClienteService.ClienteVista crear(@AuthenticationPrincipal KioskPrincipal p, @RequestBody ClienteService.Datos d) {
        // El cajero puede anotar un cliente nuevo, pero el límite lo pone el dueño.
        boolean jefe = p != null && (p.rol().name().equals("DUENO") || p.rol().name().equals("ENCARGADO"));
        return service.crear(jefe ? d : new ClienteService.Datos(d.nombre(), d.cedula(), d.telefono(), null, null));
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
