package com.kioskpos.web.compra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cliente.ClienteService;
import com.kioskpos.web.cuadre.CuadreService;
import com.kioskpos.web.devolucion.DevolucionService;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
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

/** Sección 5: compras con costo promedio, anular ventas y devoluciones parciales. */
@SpringBootTest
class CompraDevolucionTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private NegocioRepository negocioRepository;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private PermisoService permisoService;
    @Autowired private CuadreService cuadreService;
    @Autowired private VentaService ventaService;
    @Autowired private CompraService compraService;
    @Autowired private DevolucionService devolucionService;
    @Autowired private ClienteService clienteService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private record M(Long negocioId, KioskPrincipal caja, KioskPrincipal dueno, String permiso, Long productoId, Long turnoId) {
    }

    /** Negocio al día, caja con turno abierto (fondo $20) y un producto de $2 (costo $1, stock 10). */
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
            p.setCodigoBarras("C-" + email);
            p.setNombre("Harina PAN");
            p.setPrecioUsd(new BigDecimal("2.00"));
            p.setCostoUsd(new BigDecimal("1.00"));
            p.setStockActual(new BigDecimal("10"));
            p.setActivo(true);
            Long prod = productoRepository.save(p).getId();
            Long turno = cuadreService.abrir(cajaId, cajeroId, new BigDecimal("20"), BigDecimal.ZERO).getId();
            return new M(neg, new KioskPrincipal(cajeroId, neg, RolUsuario.CAJERO, cajaId),
                    new KioskPrincipal(reg.duenoId(), neg, RolUsuario.DUENO, null),
                    permisoService.renovar(neg, cajaId).permiso(), prod, turno);
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

    private Producto producto(M m) {
        return en(m.negocioId(), () -> productoRepository.findById(m.productoId()).orElseThrow());
    }

    private Venta vender(M m, String codigo, int cantidad, Long clienteId, VentaService.PagoInput pago) {
        var item = new VentaService.ItemInput(m.productoId(), new BigDecimal(cantidad), null, null);
        return en(m.negocioId(), () -> ventaService.registrar(m.caja(), m.permiso(),
                new VentaService.VentaInput(codigo, new BigDecimal("40"), List.of(item), List.of(pago), null, clienteId)));
    }

    private static VentaService.PagoInput usd(String monto) {
        return new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal(monto), null);
    }

    @Test
    void costoPromedioPonderado() {
        assertThat(CompraService.costoPromedio(new BigDecimal("10"), new BigDecimal("1.00"), new BigDecimal("10"), new BigDecimal("2.00")))
                .isEqualByComparingTo("1.50");
        assertThat(CompraService.costoPromedio(BigDecimal.ZERO, new BigDecimal("1.00"), new BigDecimal("5"), new BigDecimal("3.00")))
                .isEqualByComparingTo("3.00");
        assertThat(CompraService.costoPromedio(new BigDecimal("-2"), new BigDecimal("1.00"), new BigDecimal("5"), new BigDecimal("3.00")))
                .isEqualByComparingTo("3.00");
    }

    @Test
    void compraSumaStockRecalculaCostoYSePuedeAnular() {
        M m = montar("compra1@ejemplo.com");
        var prov = en(m.negocioId(), () -> compraService.guardarProveedor(null,
                new CompraService.DatosProveedor("Distribuidora Polar", "j-123456789", null, null, null)));
        assertThat(prov.getRif()).isEqualTo("J-123456789");

        var c = en(m.negocioId(), () -> compraService.registrar(m.dueno(), new CompraService.NuevaCompra(prov.getId(), "A-001",
                null, new BigDecimal("40"), false, null,
                List.of(new CompraService.ItemCompra(m.productoId(), new BigDecimal("10"), new BigDecimal("2.00"), new BigDecimal("3.00"))))));
        assertThat(c.compra().getTotalUsd()).isEqualByComparingTo("20.00");

        Producto p = producto(m);
        assertThat(p.getStockActual()).isEqualByComparingTo("20");
        assertThat(p.getCostoUsd()).isEqualByComparingTo("1.50");
        assertThat(p.getPrecioUsd()).isEqualByComparingTo("3.00");

        var provs = en(m.negocioId(), () -> compraService.proveedores());
        assertThat(provs.get(0).porPagarUsd()).isEqualByComparingTo("20.00");
        en(m.negocioId(), () -> compraService.marcarPagada(c.compra().getId(), true));
        assertThat(en(m.negocioId(), () -> compraService.proveedores()).get(0).porPagarUsd()).isEqualByComparingTo("0");

        en(m.negocioId(), () -> compraService.anular(m.dueno(), c.compra().getId()));
        assertThat(producto(m).getStockActual()).isEqualByComparingTo("10");
        assertThatThrownBy(() -> en(m.negocioId(), () -> compraService.anular(m.dueno(), c.compra().getId())))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void anularVentaDevuelveStockYSaleDelCuadre() {
        M m = montar("anular1@ejemplo.com");
        Venta v = vender(m, "AN-1", 2, null, usd("5.00")); // $4, vuelto $1
        assertThat(en(m.negocioId(), () -> cuadreService.resumen(m.turnoId())).esperadoUsd()).isEqualByComparingTo("24.00");

        assertThatThrownBy(() -> en(m.negocioId(), () -> devolucionService.anular(m.caja(), v.getId(), " ")))
                .isInstanceOf(IllegalArgumentException.class);
        en(m.negocioId(), () -> devolucionService.anular(m.caja(), v.getId(), "Cobré dos veces"));

        assertThat(producto(m).getStockActual()).isEqualByComparingTo("10");
        assertThat(en(m.negocioId(), () -> cuadreService.resumen(m.turnoId())).esperadoUsd()).isEqualByComparingTo("20.00");
        assertThat(en(m.negocioId(), () -> devolucionService.detalle(v.getId())).estado()).isEqualTo("ANULADA");

        // Con el turno cerrado ya no se anula: hay que devolver.
        Venta v2 = vender(m, "AN-2", 1, null, usd("2.00"));
        en(m.negocioId(), () -> cuadreService.cerrarSimple(m.turnoId(), new BigDecimal("22"), BigDecimal.ZERO));
        assertThatThrownBy(() -> en(m.negocioId(), () -> devolucionService.anular(m.dueno(), v2.getId(), "error")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("Devolver");
    }

    @Test
    void devolucionParcialEnEfectivoYNoMasDeLoVendido() {
        M m = montar("dev1@ejemplo.com");
        Venta v = vender(m, "DV-1", 3, null, usd("6.00")); // 3 × $2
        Long lineaId = en(m.negocioId(), () -> devolucionService.detalle(v.getId())).lineas().get(0).detalleId();

        var d = en(m.negocioId(), () -> devolucionService.devolver(m.caja(), v.getId(), new DevolucionService.NuevaDevolucion(
                List.of(new DevolucionService.ItemDevolucion(lineaId, BigDecimal.ONE)), "EFECTIVO_USD", "Vencido")));
        assertThat(d.devolucion().getMontoReembolso()).isEqualByComparingTo("2.00");
        assertThat(producto(m).getStockActual()).isEqualByComparingTo("8"); // 10 − 3 + 1

        var r = en(m.negocioId(), () -> cuadreService.resumen(m.turnoId()));
        assertThat(r.esperadoUsd()).isEqualByComparingTo("24.00"); // 20 + 6 − 2
        assertThat(r.movimientos()).anySatisfy(l -> assertThat(l.tipo()).isEqualTo("DEVOLUCION"));

        assertThatThrownBy(() -> en(m.negocioId(), () -> devolucionService.devolver(m.caja(), v.getId(), new DevolucionService.NuevaDevolucion(
                List.of(new DevolucionService.ItemDevolucion(lineaId, new BigDecimal("3"))), "EFECTIVO_USD", null))))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("solo se pueden devolver 2");
        // Con devoluciones ya no se anula.
        assertThatThrownBy(() -> en(m.negocioId(), () -> devolucionService.anular(m.caja(), v.getId(), "x")))
                .isInstanceOf(IllegalStateException.class);
        // Fuera de caja solo el dueño.
        assertThatThrownBy(() -> en(m.negocioId(), () -> devolucionService.devolver(m.caja(), v.getId(), new DevolucionService.NuevaDevolucion(
                List.of(new DevolucionService.ItemDevolucion(lineaId, BigDecimal.ONE)), "FUERA_DE_CAJA", null))))
                .isInstanceOf(IllegalArgumentException.class);
        en(m.negocioId(), () -> devolucionService.devolver(m.dueno(), v.getId(), new DevolucionService.NuevaDevolucion(
                List.of(new DevolucionService.ItemDevolucion(lineaId, BigDecimal.ONE)), "FUERA_DE_CAJA", null)));
        assertThat(en(m.negocioId(), () -> devolucionService.detalle(v.getId())).devueltoUsd()).isEqualByComparingTo("4.00");
    }

    @Test
    void anularUnaVentaFiadaBajaLaDeuda() {
        M m = montar("anfiado@ejemplo.com");
        var cli = en(m.negocioId(), () -> clienteService.crear(new ClienteService.Datos("Rosa", null, null, null, null)));
        Venta v = vender(m, "AF-1", 2, cli.id(), new VentaService.PagoInput(MetodoPago.FIADO, Moneda.USD, new BigDecimal("4.00"), null));
        assertThat(en(m.negocioId(), () -> clienteService.saldoDe(cli.id()))).isEqualByComparingTo("4.00");
        en(m.negocioId(), () -> devolucionService.anular(m.caja(), v.getId(), "No se llevó nada"));
        assertThat(en(m.negocioId(), () -> clienteService.saldoDe(cli.id()))).isEqualByComparingTo("0");
    }

    @Test
    void devolverComoPagoRegresaCadaFormaYBajaLaBarraDelTurno() {
        M m = montar("comopago@ejemplo.com");
        // 3 × $2 = $6: $3 en efectivo + Bs 120 por pago móvil (tasa 40 → $3).
        var item = new VentaService.ItemInput(m.productoId(), new BigDecimal("3"), null, null);
        Venta v = en(m.negocioId(), () -> ventaService.registrar(m.caja(), m.permiso(), new VentaService.VentaInput("CP-1",
                new BigDecimal("40"), List.of(item), List.of(usd("3.00"),
                new VentaService.PagoInput(MetodoPago.PAGO_MOVIL, Moneda.VES, new BigDecimal("120.00"), "1234")))));
        Long linea = en(m.negocioId(), () -> devolucionService.detalle(v.getId())).lineas().get(0).detalleId();

        var antes = en(m.negocioId(), () -> cuadreService.resumen(m.turnoId()));
        var h = en(m.negocioId(), () -> devolucionService.devolver(m.caja(), v.getId(), new DevolucionService.NuevaDevolucion(
                List.of(new DevolucionService.ItemDevolucion(linea, new BigDecimal("3"))), "COMO_PAGO", "Devuelve todo", "5678")));
        assertThat(h.reembolsos()).hasSize(2);
        var r = en(m.negocioId(), () -> cuadreService.resumen(m.turnoId()));
        assertThat(r.esperadoUsd()).isEqualByComparingTo(antes.esperadoUsd().subtract(new BigDecimal("3")));
        BigDecimal pm = r.metodos().stream().filter(x -> x.metodo().equals("PAGO_MOVIL")).findFirst().orElseThrow().esperado();
        assertThat(pm).isEqualByComparingTo("0");
        assertThat(producto(m).getStockActual()).isEqualByComparingTo("10"); // todo volvió
        assertThat(en(m.negocioId(), () -> devolucionService.detalle(v.getId())).devoluciones().get(0).reembolsos()).hasSize(2);
    }

    @Test
    void fiarDesdeElPerfilSinCajaBajaStockYCuentaPorPeso() {
        M m = montar("libreta@ejemplo.com");
        var cli = en(m.negocioId(), () -> clienteService.crear(new ClienteService.Datos("Luis", null, null, null, null,
                "TRABAJADOR", new BigDecimal("50"))));
        // El dueño (sin caja) le fía 1,5 unidades (como si fuera por peso) del producto de $2.
        Venta v = en(m.negocioId(), () -> ventaService.fiarDesdeLibreta(m.dueno(), cli.id(), new BigDecimal("40"),
                List.of(new VentaService.ItemInput(m.productoId(), new BigDecimal("1.5"), null, null))));
        assertThat(v.getCajaId()).isNull();
        assertThat(v.getTotalUsd()).isEqualByComparingTo("3.00");
        assertThat(v.getNumeroFactura()).isEqualTo(1);
        assertThat(producto(m).getStockActual()).isEqualByComparingTo("8.5");
        assertThat(en(m.negocioId(), () -> clienteService.saldoDe(cli.id()))).isEqualByComparingTo("3.00");
        // El siguiente fiado sin caja sigue el correlativo; el cuadre de la caja no cambia.
        Venta v2 = en(m.negocioId(), () -> ventaService.fiarDesdeLibreta(m.dueno(), cli.id(), new BigDecimal("40"),
                List.of(new VentaService.ItemInput(m.productoId(), BigDecimal.ONE, null, null))));
        assertThat(v2.getNumeroFactura()).isEqualTo(2);
        assertThat(en(m.negocioId(), () -> cuadreService.resumen(m.turnoId())).esperadoUsd()).isEqualByComparingTo("20.00");
        // Sin stock suficiente no se fía.
        assertThatThrownBy(() -> en(m.negocioId(), () -> ventaService.fiarDesdeLibreta(m.dueno(), cli.id(), new BigDecimal("40"),
                List.of(new VentaService.ItemInput(m.productoId(), new BigDecimal("100"), null, null)))))
                .isInstanceOf(IllegalStateException.class);
    }
}
