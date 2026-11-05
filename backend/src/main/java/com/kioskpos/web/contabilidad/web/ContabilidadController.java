package com.kioskpos.web.contabilidad.web;

import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.contabilidad.CategoriaGasto;
import com.kioskpos.web.contabilidad.ContaGasto;
import com.kioskpos.web.contabilidad.ContaLibroLinea;
import com.kioskpos.web.contabilidad.ContabilidadService;
import com.kioskpos.web.contabilidad.TipoLinea;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
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

/**
 * Contabilidad del panel del dueño (solo DUENO; ver SecurityConfig). Dos modos:
 * automático ({@code /resumen}, {@code /gastos}, {@code /config}) y manual
 * ({@code /libro}). Período por defecto: el mes en curso (America/Caracas).
 */
@RestController
@RequestMapping("/api/contabilidad")
public class ContabilidadController {

    private static final ZoneId ZONA = ZoneId.of("America/Caracas");

    private final ContabilidadService servicio;

    public ContabilidadController(ContabilidadService servicio) {
        this.servicio = servicio;
    }

    // ---- Modo automático: tablero ----

    @GetMapping("/resumen")
    public ContabilidadService.Resumen resumen(
            @RequestParam(value = "desde", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(value = "hasta", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        LocalDate[] r = rango(desde, hasta);
        return servicio.resumen(r[0], r[1]);
    }

    // ---- Modo automático: gastos anotados ----

    @GetMapping("/gastos")
    public List<GastoResponse> listarGastos(
            @RequestParam(value = "desde", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(value = "hasta", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        LocalDate[] r = rango(desde, hasta);
        return servicio.listarGastos(r[0], r[1]).stream().map(GastoResponse::de).toList();
    }

    @PostMapping("/gastos")
    public GastoResponse crearGasto(@RequestBody GastoRequest req, @AuthenticationPrincipal KioskPrincipal p) {
        return GastoResponse.de(servicio.crearGasto(
                req.fecha(), req.categoria(), req.concepto(), req.montoUsd(), p != null ? p.usuarioId() : null));
    }

    @PutMapping("/gastos/{id}")
    public GastoResponse actualizarGasto(@PathVariable Long id, @RequestBody GastoRequest req) {
        return GastoResponse.de(servicio.actualizarGasto(
                id, req.fecha(), req.categoria(), req.concepto(), req.montoUsd()));
    }

    @DeleteMapping("/gastos/{id}")
    public Map<String, Object> eliminarGasto(@PathVariable Long id) {
        servicio.eliminarGasto(id);
        return Map.of("eliminado", true);
    }

    // ---- Modo manual: mi libro ----

    @GetMapping("/libro")
    public LibroResponse libro(
            @RequestParam(value = "desde", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(value = "hasta", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        LocalDate[] r = rango(desde, hasta);
        return LibroResponse.de(servicio.resumenLibro(r[0], r[1]));
    }

    @PostMapping("/libro")
    public LineaResponse crearLinea(@RequestBody LineaRequest req, @AuthenticationPrincipal KioskPrincipal p) {
        return LineaResponse.de(servicio.crearLinea(
                req.fecha(), req.concepto(), req.tipo(), req.montoUsd(), p != null ? p.usuarioId() : null));
    }

    @PutMapping("/libro/{id}")
    public LineaResponse actualizarLinea(@PathVariable Long id, @RequestBody LineaRequest req) {
        return LineaResponse.de(servicio.actualizarLinea(id, req.fecha(), req.concepto(), req.tipo(), req.montoUsd()));
    }

    @DeleteMapping("/libro/{id}")
    public Map<String, Object> eliminarLinea(@PathVariable Long id) {
        servicio.eliminarLinea(id);
        return Map.of("eliminado", true);
    }

    // ---- Config (porcentaje de reparto) ----

    @GetMapping("/config")
    public Map<String, Object> getConfig() {
        return Map.of("repartoMercanciaPct", servicio.getRepartoPct());
    }

    @PutMapping("/config")
    public Map<String, Object> setConfig(@RequestBody ConfigRequest req) {
        return Map.of("repartoMercanciaPct", servicio.setRepartoPct(req.repartoMercanciaPct()));
    }

    // ---- helpers ----

    /** Si no dan rango, el mes en curso (del día 1 a hoy), en America/Caracas. */
    private static LocalDate[] rango(LocalDate desde, LocalDate hasta) {
        LocalDate hoy = LocalDate.now(ZONA);
        LocalDate d = desde != null ? desde : hoy.withDayOfMonth(1);
        LocalDate h = hasta != null ? hasta : hoy;
        return new LocalDate[] {d, h};
    }

    // ---- DTOs ----

    public record GastoRequest(LocalDate fecha, CategoriaGasto categoria, String concepto, BigDecimal montoUsd) {
    }

    public record GastoResponse(Long id, LocalDate fecha, CategoriaGasto categoria, String concepto,
                                BigDecimal montoUsd) {
        static GastoResponse de(ContaGasto g) {
            return new GastoResponse(g.getId(), g.getFecha(), g.getCategoria(), g.getConcepto(), g.getMontoUsd());
        }
    }

    public record LineaRequest(LocalDate fecha, String concepto, TipoLinea tipo, BigDecimal montoUsd) {
    }

    public record LineaResponse(Long id, LocalDate fecha, String concepto, TipoLinea tipo, BigDecimal montoUsd) {
        static LineaResponse de(ContaLibroLinea l) {
            return new LineaResponse(l.getId(), l.getFecha(), l.getConcepto(), l.getTipo(), l.getMontoUsd());
        }
    }

    public record LibroResponse(List<LineaResponse> lineas, BigDecimal ingresos, BigDecimal egresos,
                                BigDecimal saldo) {
        static LibroResponse de(ContabilidadService.ResumenLibro r) {
            return new LibroResponse(
                    r.lineas().stream().map(LineaResponse::de).toList(),
                    r.ingresos(), r.egresos(), r.saldo());
        }
    }

    public record ConfigRequest(BigDecimal repartoMercanciaPct) {
    }
}
