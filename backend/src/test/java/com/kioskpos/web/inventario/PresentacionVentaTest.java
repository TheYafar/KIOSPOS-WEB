package com.kioskpos.web.inventario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cuadre.CuadreService;
import com.kioskpos.web.devolucion.DevolucionService;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import com.kioskpos.web.venta.DetalleVenta;
import com.kioskpos.web.venta.MetodoPago;
import com.kioskpos.web.venta.Moneda;
import com.kioskpos.web.venta.Venta;
import com.kioskpos.web.venta.VentaService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Productos por bloques: una caja de cigarros trae 20, la media 10, y también se venden
 * sueltos. Vender una caja baja 20 del stock; devolverla o anular la venta los repone.
 */
@SpringBootTest
class PresentacionVentaTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private NegocioRepository negocioRepository;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private PermisoService permisoService;
    @Autowired private CuadreService cuadreService;
    @Autowired private VentaService ventaService;
    @Autowired private DevolucionService devolucionService;
    @Autowired private PresentacionService presentacionService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private record M(Long negocioId, KioskPrincipal caja, String permiso, Long productoId, Long caja20, Long media10) {
    }

    /** Cigarros: $0,30 la unidad (costo $0,20), stock 100; Caja x20 a $5,00 y Media caja x10 a $2,60. */
    private M montar(String email) {
        var reg = negocioRegistroService.registrarNegocioConDueno("Neg " + email, "Dueño", email, "clave-secreta");
        Long neg = reg.negocioId();
        Negocio n = negocioRepository.findById(neg).orElseThrow();
        n.setPagoHasta(LocalDate.now().plusDays(10));
        negocioRepository.save(n);
        return en(neg, () -> {
            Long cajaId = cajaService.registrar("Caja 1", null).caja().getId();
            Long cajeroId = usuarioService.crearCajero("Ana", "1234").getId();
            Producto p = new Producto();
            p.setNegocioId(neg);
            p.setCodigoBarras("CIG-" + email);
            p.setNombre("Cigarros Belmont");
            p.setPrecioUsd(new BigDecimal("0.30"));
            p.setCostoUsd(new BigDecimal("0.20"));
            p.setStockActual(new BigDecimal("100"));
            p.setActivo(true);
            Long prod = productoRepository.save(p).getId();
            cuadreService.abrir(cajaId, cajeroId, new BigDecimal("20"), BigDecimal.ZERO);
            var lista = presentacionService.guardar(prod, List.of(
                    new PresentacionService.PresentacionInput("Caja", new BigDecimal("20"), new BigDecimal("5.00"), null),
                    new PresentacionService.PresentacionInput("Media caja", new BigDecimal("10"), new BigDecimal("2.60"), null)));
            Long caja = lista.stream().filter(x -> x.nombre().equals("Caja")).findFirst().orElseThrow().id();
            Long media = lista.stream().filter(x -> x.nombre().equals("Media caja")).findFirst().orElseThrow().id();
            return new M(neg, new KioskPrincipal(cajeroId, neg, RolUsuario.CAJERO, cajaId),
                    permisoService.renovar(neg, cajaId).permiso(), prod, caja, media);
        });
    }

    private static <T> T en(Long negocioId, Supplier<T> f) {
        try {
            NegocioContext.set(negocioId);
            return f.get();
        } finally {
            NegocioContext.clear();
        }
    }

    private BigDecimal stock(M m) {
        return en(m.negocioId(), () -> productoRepository.findById(m.productoId()).orElseThrow().getStockActual());
    }

    private Venta vender(M m, String codigo, List<VentaService.ItemInput> items, String pagoUsd) {
        var pago = new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal(pagoUsd), null);
        return en(m.negocioId(), () -> ventaService.registrar(m.caja(), m.permiso(),
                new VentaService.VentaInput(codigo, new BigDecimal("40"), items, List.of(pago))));
    }

    @Test
    void venderCajaMediaYSueltoBajaElStockEnUnidades() {
        M m = montar("bloques1@ejemplo.com");
        Venta v = vender(m, "BLQ-1", List.of(
                new VentaService.ItemInput(m.productoId(), new BigDecimal("2"), null, null, m.caja20()),   // 2 cajas = 40 u, $10,00
                new VentaService.ItemInput(m.productoId(), BigDecimal.ONE, null, null, m.media10()),       // media = 10 u, $2,60
                new VentaService.ItemInput(m.productoId(), new BigDecimal("3"), null, null)),              // 3 sueltos, $0,90
                "20.00");

        assertThat(v.getTotalUsd()).isEqualByComparingTo("13.50");
        assertThat(stock(m)).isEqualByComparingTo("47"); // 100 - 40 - 10 - 3
        DetalleVenta cajas = v.getDetalles().get(0);
        assertThat(cajas.getNombre()).isEqualTo("Cigarros Belmont (Caja x20)");
        assertThat(cajas.getCantidad()).isEqualByComparingTo("2");
        assertThat(cajas.getUnidades()).isEqualByComparingTo("20");
        assertThat(cajas.getPrecioUnitarioUsd()).isEqualByComparingTo("5.00");
        assertThat(cajas.getCostoUnitarioUsd()).isEqualByComparingTo("4.00"); // 20 × $0,20: la ganancia sale bien
    }

    @Test
    void devolverUnaCajaYAnularReponenLasUnidades() {
        M m = montar("bloques2@ejemplo.com");
        Venta v = vender(m, "BLQ-2", List.of(new VentaService.ItemInput(m.productoId(), new BigDecimal("2"), null, null, m.caja20())), "10.00");
        assertThat(stock(m)).isEqualByComparingTo("60");

        Long linea = v.getDetalles().get(0).getId();
        var d = en(m.negocioId(), () -> devolucionService.devolver(m.caja(), v.getId(), new DevolucionService.NuevaDevolucion(
                List.of(new DevolucionService.ItemDevolucion(linea, BigDecimal.ONE)), "EFECTIVO_USD", "Se equivocó")));
        assertThat(d.devolucion().getMontoReembolso()).isEqualByComparingTo("5.00");
        assertThat(stock(m)).isEqualByComparingTo("80");

        Venta v2 = vender(m, "BLQ-3", List.of(new VentaService.ItemInput(m.productoId(), BigDecimal.ONE, null, null, m.media10())), "2.60");
        assertThat(stock(m)).isEqualByComparingTo("70");
        en(m.negocioId(), () -> devolucionService.anular(m.caja(), v2.getId(), "Cobré mal"));
        assertThat(stock(m)).isEqualByComparingTo("80");
    }

    @Test
    void noVendeMasBloquesQueElStockNiPresentacionesAjenas() {
        M m = montar("bloques3@ejemplo.com");
        assertThatThrownBy(() -> vender(m, "BLQ-4",
                List.of(new VentaService.ItemInput(m.productoId(), new BigDecimal("6"), null, null, m.caja20())), "30.00")) // 120 > 100
                .isInstanceOf(IllegalStateException.class);
        assertThat(stock(m)).isEqualByComparingTo("100");

        M otro = montar("bloques4@ejemplo.com");
        assertThatThrownBy(() -> vender(m, "BLQ-5",
                List.of(new VentaService.ItemInput(m.productoId(), BigDecimal.ONE, null, null, otro.caja20())), "5.00"))
                .isInstanceOf(IllegalArgumentException.class); // de otro negocio: RLS no la deja ver
    }

    @Test
    void validaLasPresentaciones() {
        M m = montar("bloques5@ejemplo.com");
        assertThatThrownBy(() -> en(m.negocioId(), () -> presentacionService.guardar(m.productoId(), List.of(
                new PresentacionService.PresentacionInput("Caja", new BigDecimal("20"), new BigDecimal("5"), null),
                new PresentacionService.PresentacionInput("caja", new BigDecimal("10"), new BigDecimal("3"), null)))))
                .hasMessageContaining("dos presentaciones");
        assertThatThrownBy(() -> en(m.negocioId(), () -> presentacionService.guardar(m.productoId(), List.of(
                new PresentacionService.PresentacionInput("Caja", new BigDecimal("2.5"), new BigDecimal("5"), null)))))
                .hasMessageContaining("entero");
        // Lista vacía = solo se vende suelto.
        assertThat(en(m.negocioId(), () -> presentacionService.guardar(m.productoId(), List.of()))).isEmpty();
    }
}
