package com.kioskpos.web.auth.web;

import com.kioskpos.web.auth.Caja;
import com.kioskpos.web.auth.CajaService;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cajas")
public class CajaController {

    private final CajaService cajaService;

    public CajaController(CajaService cajaService) {
        this.cajaService = cajaService;
    }

    /**
     * Registra y autoriza una caja. Devuelve el token EN CLARO una sola vez: el
     * navegador de la caja debe guardarlo (no se puede volver a consultar).
     */
    @PostMapping
    public CajaCreadaResponse registrar(@RequestBody CrearCajaRequest req) {
        CajaService.CajaRegistrada r = cajaService.registrar(req.nombre(), req.localId());
        Caja c = r.caja();
        return new CajaCreadaResponse(c.getId(), c.getNombre(), c.getLocalId(), r.tokenClaro());
    }

    @GetMapping
    public List<CajaResponse> listar() {
        return cajaService.listar().stream()
                .map(c -> new CajaResponse(c.getId(), c.getNombre(), c.getLocalId(),
                        c.isAutorizada(), c.isActiva()))
                .toList();
    }

    public record CrearCajaRequest(@NotBlank String nombre, Long localId) {
    }

    public record CajaCreadaResponse(Long id, String nombre, Long localId, String cajaToken) {
    }

    public record CajaResponse(Long id, String nombre, Long localId, boolean autorizada, boolean activa) {
    }
}
