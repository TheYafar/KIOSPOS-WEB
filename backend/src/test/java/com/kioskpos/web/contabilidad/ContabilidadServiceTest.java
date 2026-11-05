package com.kioskpos.web.contabilidad;

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
 * Contabilidad (P2): el tablero automático calcula entró/salió/queda/reparto desde
 * datos reales; el libro manual SOLO suma lo que escribe el dueño (sin mezclar datos
 * del sistema); y todo queda aislado por negocio (RLS).
 */
@SpringBootTest
class ContabilidadServiceTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private NegocioRepository negocioRepository;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private VentaService ventaService;
    @Autowired private PermisoService permisoService;
    @Autowired private ContabilidadService contabilidadService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    /** Monta un negocio al día con 2 ventas (ganancia $8). Devuelve su id. */
    private Long negocioConVentas(String nombre, String correo) {
        Long neg = negocioRegistroService
                .registrarNegocioConDueno(nombre, "Dueño", correo, "clave-secreta").negocioId();
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
            var item = new VentaService.ItemInput(productoId, new BigDecimal("2"), null, null);
            var pago = new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal("10.00"), null);
            ventaService.registrar(caja, permiso,
                    new VentaService.VentaInput("V-1", new BigDecimal("40.00"), List.of(item), List.of(pago)));
            ventaService.registrar(caja, permiso,
                    new VentaService.VentaInput("V-2", new BigDecimal("40.00"), List.of(item), List.of(pago)));
        } finally {
            NegocioContext.clear();
        }
        return neg;
    }

    @Test
    void resumenAutomaticoCalculaEntroSalioQuedaYReparto() {
        Long neg = negocioConVentas("Cocoa", "conta1@ejemplo.com");
        // Ventana que envuelve "hoy" para no depender del minuto exacto (zona Caracas).
        LocalDate hoy = LocalDate.now();
        LocalDate desde = hoy.minusDays(1);
        LocalDate hasta = hoy.plusDays(1);

        try {
            NegocioContext.set(neg);
            contabilidadService.crearGasto(hoy, CategoriaGasto.SERVICIOS, "Luz", new BigDecimal("2.00"), null);
            contabilidadService.crearGasto(hoy, CategoriaGasto.OTRO, "Varios", new BigDecimal("1.00"), null);
            // Reparto por defecto 40%.

            var r = contabilidadService.resumen(desde, hasta);
            assertThat(r.entro()).isEqualByComparingTo("8.00");    // $20 venta − $12 costo
            assertThat(r.nomina()).isEqualByComparingTo("0.00");   // costura: nómina aún sin backend
            assertThat(r.servicios()).isEqualByComparingTo("2.00");
            assertThat(r.otros()).isEqualByComparingTo("1.00");
            assertThat(r.salio()).isEqualByComparingTo("3.00");
            assertThat(r.queda()).isEqualByComparingTo("5.00");
            assertThat(r.repartoMercanciaPct()).isEqualByComparingTo("40.00");
            assertThat(r.mercancia()).isEqualByComparingTo("2.00");  // 5 × 40%
            assertThat(r.bolsillo()).isEqualByComparingTo("3.00");   // el resto
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void repartoRespetaElPorcentajeConfigurado() {
        Long neg = negocioConVentas("Cocoa 60", "conta2@ejemplo.com");
        LocalDate hoy = LocalDate.now();
        try {
            NegocioContext.set(neg);
            contabilidadService.setRepartoPct(new BigDecimal("60"));
            var r = contabilidadService.resumen(hoy.minusDays(1), hoy.plusDays(1));
            assertThat(r.queda()).isEqualByComparingTo("8.00");       // sin gastos: queda = entró
            assertThat(r.mercancia()).isEqualByComparingTo("4.80");   // 8 × 60%
            assertThat(r.bolsillo()).isEqualByComparingTo("3.20");
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void libroManualSoloSumaLoEscritoNoDatosDelSistema() {
        Long neg = negocioConVentas("Cocoa libro", "conta3@ejemplo.com");
        LocalDate hoy = LocalDate.now();
        try {
            NegocioContext.set(neg);
            // Hay ventas (entró $8) y un gasto; nada de eso debe aparecer en el libro.
            contabilidadService.crearGasto(hoy, CategoriaGasto.SERVICIOS, "Luz", new BigDecimal("50.00"), null);
            contabilidadService.crearLinea(hoy, "Aporte socio", TipoLinea.INGRESO, new BigDecimal("100.00"), null);
            contabilidadService.crearLinea(hoy, "Compra ventilador", TipoLinea.EGRESO, new BigDecimal("30.00"), null);

            var libro = contabilidadService.resumenLibro(hoy.minusDays(1), hoy.plusDays(1));
            assertThat(libro.ingresos()).isEqualByComparingTo("100.00");
            assertThat(libro.egresos()).isEqualByComparingTo("30.00");
            assertThat(libro.saldo()).isEqualByComparingTo("70.00"); // 100 − 30, nada del sistema
            assertThat(libro.lineas()).hasSize(2);
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void contabilidadAisladaPorNegocio() {
        Long a = negocioConVentas("Negocio A", "conta4a@ejemplo.com");
        Long b = negocioRegistroService
                .registrarNegocioConDueno("Negocio B", "Pedro", "conta4b@ejemplo.com", "clave-secreta").negocioId();
        LocalDate hoy = LocalDate.now();

        try {
            NegocioContext.set(a);
            contabilidadService.crearGasto(hoy, CategoriaGasto.INTERNET, "Fibra", new BigDecimal("15.00"), null);
            contabilidadService.crearLinea(hoy, "Privado de A", TipoLinea.INGRESO, new BigDecimal("500.00"), null);
        } finally {
            NegocioContext.clear();
        }

        try {
            NegocioContext.set(b);
            // B no ve nada de A: ni gastos, ni libro, ni ganancia.
            assertThat(contabilidadService.listarGastos(hoy.minusDays(1), hoy.plusDays(1))).isEmpty();
            var libroB = contabilidadService.resumenLibro(hoy.minusDays(1), hoy.plusDays(1));
            assertThat(libroB.lineas()).isEmpty();
            assertThat(libroB.saldo()).isEqualByComparingTo("0.00");
            var rB = contabilidadService.resumen(hoy.minusDays(1), hoy.plusDays(1));
            assertThat(rB.entro()).isEqualByComparingTo("0.00");
            assertThat(rB.salio()).isEqualByComparingTo("0.00");
        } finally {
            NegocioContext.clear();
        }
    }
}
