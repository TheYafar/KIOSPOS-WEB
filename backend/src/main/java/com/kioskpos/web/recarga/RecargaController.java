package com.kioskpos.web.recarga;

import com.kioskpos.web.auth.security.KioskPrincipal;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/recargas")
public class RecargaController {

    private final RecargaService service;

    public RecargaController(RecargaService service) {
        this.service = service;
    }

    @PostMapping
    public Recarga registrar(@AuthenticationPrincipal KioskPrincipal principal, @RequestBody RecargaService.Nueva req) {
        return service.registrar(principal, req);
    }

    @GetMapping
    public List<Recarga> delTurno(@RequestParam Long turnoId) {
        return service.delTurno(turnoId);
    }

    @PostMapping("/{id}/anular")
    public Recarga anular(@AuthenticationPrincipal KioskPrincipal principal, @PathVariable Long id) {
        return service.anular(principal, id);
    }
}
