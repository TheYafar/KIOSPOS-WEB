package com.kioskpos.web.reporte.web;

import com.kioskpos.web.reporte.ReporteService;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reportes del día (panel básico del dueño). Autenticado; cualquier usuario del
 * negocio puede verlo (el dueño desde su panel, el encargado o el cajero en la caja).
 */
@RestController
@RequestMapping("/api/reportes")
public class ReporteController {

    private final ReporteService reporteService;

    public ReporteController(ReporteService reporteService) {
        this.reporteService = reporteService;
    }

    @GetMapping("/dia")
    public ReporteService.ResumenDia dia(
            @RequestParam(value = "fecha", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fecha) {
        return reporteService.resumenDelDia(fecha);
    }

    /** Resumen de un rango (semana, mes...): ambos días incluidos. */
    @GetMapping("/rango")
    public ReporteService.ResumenDia rango(
            @RequestParam("desde") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam("hasta") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        return reporteService.resumenEntre(desde, hasta);
    }

    @GetMapping("/cierres")
    public List<ReporteService.CierreDia> cierres(
            @RequestParam(value = "fecha", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fecha) {
        return reporteService.cierresDelDia(fecha);
    }
}
