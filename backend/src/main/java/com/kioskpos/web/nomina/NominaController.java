package com.kioskpos.web.nomina;

import com.kioskpos.web.auth.security.KioskPrincipal;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Nómina de los trabajadores. Solo dueño o encargado (SecurityConfig). */
@RestController
@RequestMapping("/api/nomina")
public class NominaController {

    private final NominaService service;

    public NominaController(NominaService service) {
        this.service = service;
    }

    @org.springframework.beans.factory.annotation.Autowired
    private com.kioskpos.web.cliente.TrabajadorSyncService trabajadorSync;

    @GetMapping
    public NominaService.Resumen resumen() {
        trabajadorSync.asegurar(); // cajeros y encargados salen en la nómina
        return service.resumen();
    }

    @GetMapping("/pagos")
    public List<NominaService.PagoVista> historial(@RequestParam(required = false) Long trabajadorId) {
        return service.historial(trabajadorId);
    }

    @PostMapping("/pagos/{id}/anular")
    public NominaService.PagoVista anular(@AuthenticationPrincipal KioskPrincipal p, @org.springframework.web.bind.annotation.PathVariable Long id,
                                          @RequestBody AnularRequest req) {
        return service.anular(p, id, req.motivo());
    }

    public record AnularRequest(String motivo) {
    }

    @PostMapping("/pagos")
    public NominaService.PagoVista pagar(@AuthenticationPrincipal KioskPrincipal p, @RequestBody NominaService.NuevoPago in) {
        return service.pagar(p, in);
    }
}
