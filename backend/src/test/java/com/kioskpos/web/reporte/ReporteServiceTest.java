package com.kioskpos.web.reporte;

import static org.assertj.core.api.Assertions.assertThat;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import com.kioskpos.web.venta.MetodoPago;
import com.kioskpos.web.venta.Moneda;
import com.kioskpos.web.venta.VentaService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Reporte del día (Paso 10): total vendido, ganancia (venta − costo) y desglose por
 * método, aislado por negocio.
 */
@SpringBootTest
class ReporteServiceTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private NegocioRepository negocioRepository;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private VentaService ventaService;
    @Autowired private PermisoService permisoService;
    @Autowired private ReporteService reporteService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    @Test
    void resumenDelDiaSumaVentasYGanancia() {
        Long neg = negocioRegistroService
                .registrarNegocioConDueno("Cocoa", "Dueño", "rep1@ejemplo.com", "clave-secreta").negocioId();
        Negocio n = negocioRepository.findById(neg).orElseThrow();
        n.setPagoHasta(LocalDate.now().plusDays(10));
        negocioRepository.save(n);

        Long cajaId;
        Long cajeroId;
        Long productoId;
        try {
            NegocioContext.set(neg);
            cajaId = cajaService.registrar("Caja 1", null).caja().getId();
            cajeroId = usuarioService.crearCajero("Ana", "1234").getId();
            Producto p = new Producto();
            p.setNegocioId(neg);
            p.setCodigoBarras("A-1");
            p.setNombre("Harina");
            p.setPrecioUsd(new BigDecimal("5.00"));
            p.setCostoUsd(new BigDecimal("3.00"));
            p.setStockActual(new BigDecimal("100"));
            p.setActivo(true);
            productoId = productoRepository.save(p).getId();
        } finally {
            NegocioContext.clear();
        }
        String permiso = permisoService.renovar(neg, cajaId).permiso();
        KioskPrincipal caja = new KioskPrincipal(cajeroId, neg, RolUsuario.CAJERO, cajaId);

        try {
            NegocioContext.set(neg);
            // 2 ventas de 2 Harina c/u: total 4 x $5 = $20; costo 4 x $3 = $12; ganancia $8.
            var item = new VentaService.ItemInput(productoId, new BigDecimal("2"), null, null);
            var pago = new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal("10.00"), null);
            ventaService.registrar(caja, permiso,
                    new VentaService.VentaInput("R-1", new BigDecimal("40.00"), List.of(item), List.of(pago)));
            ventaService.registrar(caja, permiso,
                    new VentaService.VentaInput("R-2", new BigDecimal("40.00"), List.of(item), List.of(pago)));

            var r = reporteService.resumenDelDia(LocalDate.now());
            assertThat(r.cantidadVentas()).isEqualTo(2);
            assertThat(r.totalUsd()).isEqualByComparingTo("20.00");
            assertThat(r.costoUsd()).isEqualByComparingTo("12.00");
            assertThat(r.gananciaUsd()).isEqualByComparingTo("8.00");
            assertThat(r.pagos()).anySatisfy(p -> {
                assertThat(p.metodo()).isEqualTo("EFECTIVO_USD");
                assertThat(p.montoOriginal()).isEqualByComparingTo("20.00"); // 2 pagos de $10
            });
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void reporteAisladoPorNegocio() {
        Long otro = negocioRegistroService
                .registrarNegocioConDueno("La Esquina", "Pedro", "rep2@ejemplo.com", "clave-secreta").negocioId();
        try {
            NegocioContext.set(otro);
            var r = reporteService.resumenDelDia(LocalDate.now());
            assertThat(r.cantidadVentas()).isZero();
            assertThat(r.totalUsd()).isEqualByComparingTo("0");
        } finally {
            NegocioContext.clear();
        }
    }
}
