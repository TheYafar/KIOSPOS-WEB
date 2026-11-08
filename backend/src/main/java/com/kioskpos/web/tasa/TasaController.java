package com.kioskpos.web.tasa;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Tasa BCV del día para el frontend. Público (lo lee la pantalla de caja incluso antes
 * de iniciar sesión). Ver SecurityConfig: GET /api/tasa es permitAll.
 */
@RestController
public class TasaController {

    private final TasaService tasaService;

    public TasaController(TasaService tasaService) {
        this.tasaService = tasaService;
    }

    @GetMapping("/api/tasa")
    public Map<String, Object> tasa() {
        return tasaService.actual();
    }
}
