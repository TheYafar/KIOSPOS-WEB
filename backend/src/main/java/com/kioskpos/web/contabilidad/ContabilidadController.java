package com.kioskpos.web.contabilidad;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Libreta y hojas de Cuentas (solo dueño/encargado, por SecurityConfig). */
@RestController
@RequestMapping("/api/contabilidad")
public class ContabilidadController {

    private final ContabilidadService service;

    public ContabilidadController(ContabilidadService service) {
        this.service = service;
    }

    /** 204 si todavía no hay nada guardado en el servidor. */
    @GetMapping("/{clave}")
    public ResponseEntity<ContabilidadService.Doc> leer(@PathVariable String clave) {
        return service.leer(clave).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/{clave}")
    public ContabilidadService.Doc guardar(@PathVariable String clave, @RequestBody Guardar req) {
        return service.guardar(clave, req.contenido(), req.version() == null ? 0 : req.version());
    }

    public record Guardar(String contenido, Long version) {
    }

    /** 409 con lo que hay en el servidor, para que el equipo lo tome. */
    @ExceptionHandler(ContabilidadService.Conflicto.class)
    public ResponseEntity<Conflicto> conflicto(ContabilidadService.Conflicto e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new Conflicto(e.getMessage(), e.actual()));
    }

    public record Conflicto(String error, ContabilidadService.Doc actual) {
    }
}
