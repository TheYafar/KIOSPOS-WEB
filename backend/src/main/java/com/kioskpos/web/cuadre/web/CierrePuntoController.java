package com.kioskpos.web.cuadre.web;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cuadre.CierrePunto;
import com.kioskpos.web.cuadre.CierrePuntoService;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Tickets de cierre del punto de venta / Biopago. La lista por fechas es solo del dueño/encargado (SecurityConfig). */
@RestController
@RequestMapping("/api/cierres-punto")
public class CierrePuntoController {

    private final CierrePuntoService service;

    public CierrePuntoController(CierrePuntoService service) {
        this.service = service;
    }

    @PostMapping
    public CierrePunto registrar(@AuthenticationPrincipal KioskPrincipal p, @RequestBody CierrePuntoService.Nuevo req) {
        return service.registrar(p, req);
    }

    /** Panel del dueño: los cierres de CAJA (turnos cerrados) en el rango, con su cuadre. */
    @GetMapping("/cajas")
    public List<CierrePuntoService.CierreCajaVista> cierresDeCaja(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        return service.cierresDeCaja(desde, hasta);
    }

    @GetMapping("/turno/{turnoId}")
    public List<CierrePunto> delTurno(@PathVariable Long turnoId) {
        return service.delTurno(turnoId);
    }

    @GetMapping
    public List<CierrePuntoService.Vista> entre(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
                                                @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        return service.entre(desde, hasta);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> borrar(@AuthenticationPrincipal KioskPrincipal p, @PathVariable Long id) {
        service.borrar(p, id);
        return Map.of("borrado", true);
    }
}
