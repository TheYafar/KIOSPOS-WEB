package com.kioskpos.web.admin;

import com.kioskpos.web.auth.AuthService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.suscripcion.Pago;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Panel de super admin (uriel). Todo aquí exige ROLE_SUPER_ADMIN (ver SecurityConfig),
 * salvo /api/admin/login.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;
    private final AuthService authService;

    public AdminController(AdminService adminService, AuthService authService) {
        this.adminService = adminService;
        this.authService = authService;
    }

    /** Opción A de soporte: el super admin entra a un negocio como SOPORTE (solo lectura). */
    @PostMapping("/negocios/{id}/entrar-soporte")
    public AuthService.ResultadoLogin entrarSoporte(@PathVariable Long id) {
        return authService.entrarComoSoporte(id);
    }

    @GetMapping("/negocios")
    public List<AdminService.NegocioVista> negocios() {
        return adminService.listarNegocios();
    }

    @GetMapping("/negocios/{id}")
    public AdminService.NegocioVista negocio(@PathVariable Long id) {
        return adminService.verNegocio(id);
    }

    @PostMapping("/negocios")
    public NegocioRegistroService.NegocioCreado crearNegocio(@RequestBody CrearNegocioRequest req) {
        return adminService.crearNegocio(req.nombreNegocio(), req.nombreDueno(), req.email(), req.password(),
                req.telefono(), req.direccion(), req.cajasContratadas(), req.horariosCierre(), req.plan());
    }

    @GetMapping("/negocios/{id}/cajas")
    public List<Map<String, Object>> cajas(@PathVariable Long id) {
        return adminService.cajasDeNegocio(id).stream()
                .map(c -> Map.<String, Object>of(
                        "id", c.getId(),
                        "nombre", c.getNombre(),
                        "autorizada", c.isAutorizada(),
                        "activa", c.isActiva()))
                .toList();
    }

    @PostMapping("/negocios/{id}/suspender")
    public Map<String, String> suspender(@PathVariable Long id) {
        adminService.suspender(id);
        return Map.of("estado", "SUSPENDIDA");
    }

    @PostMapping("/negocios/{id}/reactivar")
    public Map<String, String> reactivar(@PathVariable Long id) {
        adminService.reactivar(id);
        return Map.of("estado", "ACTIVA");
    }

    @GetMapping("/pagos-pendientes")
    public List<Pago> pagosPendientes() {
        return adminService.pagosPendientes();
    }

    @PostMapping("/pagos/{pagoId}/aprobar")
    public Map<String, Object> aprobarPago(@PathVariable Long pagoId,
                                           @AuthenticationPrincipal KioskPrincipal principal) {
        var negocio = adminService.aprobarPago(pagoId, principal.usuarioId());
        return Map.of("negocioId", negocio.getId(), "pagoHasta", String.valueOf(negocio.getPagoHasta()));
    }

    /** Registrar un pago ya recibido del dueño (pago móvil, efectivo, etc.) y empujar pago_hasta. */
    @PostMapping("/negocios/{id}/pagos")
    public Map<String, Object> registrarPago(@PathVariable Long id,
                                             @RequestBody RegistrarPagoRequest req,
                                             @AuthenticationPrincipal KioskPrincipal principal) {
        var negocio = adminService.registrarPago(id, req.monto(), req.moneda(), req.metodo(),
                req.referencia(), req.meses() == null ? 1 : req.meses(), principal.usuarioId());
        return Map.of("negocioId", negocio.getId(), "pagoHasta", String.valueOf(negocio.getPagoHasta()),
                "estado", String.valueOf(negocio.getEstado()));
    }

    public record CrearNegocioRequest(
            @NotBlank String nombreNegocio, @NotBlank String nombreDueno,
            @NotBlank String email, @NotBlank String password,
            String telefono, String direccion, Integer cajasContratadas, String horariosCierre, String plan) {
    }

    public record CambiarPlanRequest(String plan, Integer cajas) {
    }

    /** Cambiar plan y cajas de un negocio (el super admin). */
    @org.springframework.web.bind.annotation.PutMapping("/negocios/{id}/plan")
    public AdminService.NegocioVista cambiarPlan(@PathVariable Long id, @RequestBody CambiarPlanRequest req) {
        return adminService.cambiarPlan(id, req.plan(), req.cajas() == null ? 1 : req.cajas());
    }

    public record RegistrarPagoRequest(
            java.math.BigDecimal monto, String moneda,
            @NotBlank String metodo, String referencia, Integer meses) {
    }
}
