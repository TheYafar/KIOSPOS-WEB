package com.kioskpos.web.venta;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.JwtService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

/**
 * El historial de ventas probado por HTTP (como lo llama la pantalla): ?fecha=AAAA-MM-DD,
 * buscar por número de factura y el detalle. Antes la fecha no se entendía y daba error.
 */
@SpringBootTest
@AutoConfigureMockMvc
class HistorialVentasWebTest extends PostgresRlsTestBase {

    @Autowired private MockMvc mvc;
    @Autowired private JwtService jwtService;
    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private PermisoService permisoService;
    @Autowired private VentaService ventaService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    @Test
    void historialPorFechaBuscarYDetalle() throws Exception {
        var reg = negocioRegistroService.registrarNegocioConDueno("Hist", "Dueño", "hist@ejemplo.com", "clave-secreta");
        Long neg = reg.negocioId();
        KioskPrincipal caja;
        Long ventaId;
        try {
            NegocioContext.set(neg);
            Long cajaId = cajaService.registrar("Caja 1", null).caja().getId();
            Long cajeroId = usuarioService.crearCajero("Ana", "1234").getId();
            Producto p = new Producto();
            p.setNegocioId(neg);
            p.setCodigoBarras("HIST-1");
            p.setNombre("Harina PAN");
            p.setPrecioUsd(new BigDecimal("2.00"));
            p.setStockActual(new BigDecimal("10"));
            p.setActivo(true);
            Long prod = productoRepository.save(p).getId();
            caja = new KioskPrincipal(cajeroId, neg, RolUsuario.CAJERO, cajaId);
            String permiso = permisoService.renovar(neg, cajaId).permiso(); // negocio nuevo: semana de prueba
            ventaId = ventaService.registrar(caja, permiso, new VentaService.VentaInput("H-1", new BigDecimal("40"),
                    List.of(new VentaService.ItemInput(prod, BigDecimal.ONE, null, null)),
                    List.of(new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal("2.00"), null)))).getId();
        } finally {
            NegocioContext.clear();
        }
        String tokCaja = "Bearer " + jwtService.emitir(caja);
        String tokDueno = "Bearer " + jwtService.emitir(new KioskPrincipal(reg.duenoId(), neg, RolUsuario.DUENO, null));
        String hoy = LocalDate.now(ZoneId.of("America/Caracas")).toString();

        mvc.perform(get("/api/ventas").param("fecha", hoy).header("Authorization", tokCaja))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].productos").value("Harina PAN"));
        mvc.perform(get("/api/ventas").param("fecha", hoy).header("Authorization", tokDueno))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/ventas").header("Authorization", tokCaja))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/ventas/buscar").param("numero", "1").header("Authorization", tokCaja))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(ventaId.intValue()));
        mvc.perform(get("/api/ventas/" + ventaId + "/detalle").header("Authorization", tokCaja))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lineas[0].nombre").value("Harina PAN"));

        // Sin sesión o con token vencido/dañado: 401 (la app lleva a entrar otra vez), no 403.
        mvc.perform(get("/api/ventas")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/ventas").header("Authorization", "Bearer token-vencido")).andExpect(status().isUnauthorized());
        // Con sesión pero sin permiso para eso (cajero en Nómina): 403.
        mvc.perform(get("/api/nomina").header("Authorization", tokCaja)).andExpect(status().isForbidden());
    }
}
