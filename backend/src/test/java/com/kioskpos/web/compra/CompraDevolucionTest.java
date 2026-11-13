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
    @Autowired private com.kioskpos.web.reporte.ReporteService reporteService;
    @Autowired private com.kioskpos.web.nomina.NominaService nominaService;

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
                null, null, new BigDecimal("40"), false, null,
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
    void abonarCompraBajaSaldoYLaDejaPagadaAlCubrirla() {
        M m = montar("abono1@ejemplo.com");
        // Factura por pagar de $20, con fecha de pago.
        var c = en(m.negocioId(), () -> compraService.registrar(m.dueno(), new CompraService.NuevaCompra(null, "F-9",
                null, LocalDate.now().plusDays(3), new BigDecimal("40"), false, null,
                List.of(new CompraService.ItemCompra(m.productoId(), new BigDecimal("10"), new BigDecimal("2.00"), null)))));
        Long id = c.compra().getId();
        assertThat(c.saldoUsd()).isEqualByComparingTo("20.00");
        assertThat(c.compra().getVence()).isEqualTo(LocalDate.now().plusDays(3));

        // Aparece como aviso de pago pendiente con su saldo.
        assertThat(en(m.negocioId(), () -> compraService.pagosPendientes()))
                .anyMatch(x -> x.compraId().equals(id) && x.saldoUsd().compareTo(new BigDecimal("20.00")) == 0);

        // Abono parcial de $12 -> saldo $8, sigue por pagar.
        var v1 = en(m.negocioId(), () -> compraService.abonar(m.dueno(), id, new BigDecimal("12"), "EFECTIVO_USD", null));
        assertThat(v1.saldoUsd()).isEqualByComparingTo("8.00");
        assertThat(v1.compra().isPagada()).isFalse();
        assertThat(v1.abonos()).hasSize(1);

        // Abonar de más solo cubre el saldo y la deja pagada (sin vencimiento).
        var v2 = en(m.negocioId(), () -> compraService.abonar(m.dueno(), id, new BigDecimal("100"), "PAGO_MOVIL", null));
        assertThat(v2.saldoUsd()).isEqualByComparingTo("0");
        assertThat(v2.compra().isPagada()).isTrue();
        assertThat(v2.compra().getVence()).isNull();
        assertThat(v2.abonos()).hasSize(2);

        // Ya pagada: no acepta más abonos y no es un pago pendiente.
        assertThatThrownBy(() -> en(m.negocioId(), () -> compraService.abonar(m.dueno(), id, new BigDecimal("1"), null, null)))
                .isInstanceOf(IllegalStateException.class);
        assertThat(en(m.negocioId(), () -> compraService.pagosPendientes()))
                .noneMatch(x -> x.compraId().equals(id));
    }

    @Test
    void guardarYBorrarFotoDeLaFactura() {
        M m = montar("foto1@ejemplo.com");
        var c = en(m.negocioId(), () -> compraService.registrar(m.dueno(), new CompraService.NuevaCompra(null, null,
                null, null, null, true, null,
                List.of(new CompraService.ItemCompra(m.productoId(), new BigDecimal("1"), new BigDecimal("1.00"), null)))));
        Long id = c.compra().getId();
        var meta = en(m.negocioId(), () -> compraService.guardarFoto(id, "image/jpeg", "QUJD"));
        assertThat(meta.id()).isNotNull();
        assertThat(en(m.negocioId(), () -> compraService.detalle(id)).fotos()).hasSize(1);
        assertThat(en(m.negocioId(), () -> compraService.foto(id, meta.id())).getDatos()).isEqualTo("QUJD");
        en(m.negocioId(), () -> { compraService.borrarFoto(id, meta.id()); return null; });
        assertThat(en(m.negocioId(), () -> compraService.detalle(id)).fotos()).isEmpty();
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

    @Test
    void laGananciaUsaElCostoDelDiaDeLaVentaYRestaLasDevoluciones() {
        M m = montar("ganancia@ejemplo.com");
        Venta v = vender(m, "G-1", 2, null, usd("4.00")); // 2 × $2, costo $1 c/u → ganancia $2
        var antes = en(m.negocioId(), () -> reporteService.resumenDelDia(null));
        // Una compra sube el costo promedio: la ganancia de esa venta NO cambia.
        en(m.negocioId(), () -> compraService.registrar(m.dueno(), new CompraService.NuevaCompra(null, null, null, null, null, true, null,
                List.of(new CompraService.ItemCompra(m.productoId(), new BigDecimal("8"), new BigDecimal("1.90"), null)))));
        var despues = en(m.negocioId(), () -> reporteService.resumenDelDia(null));
        assertThat(despues.gananciaUsd()).isEqualByComparingTo(antes.gananciaUsd());
        // Devolver 1 unidad: −$2 vendido y −$1 de costo → la ganancia baja $1.
        Long linea = en(m.negocioId(), () -> devolucionService.detalle(v.getId())).lineas().get(0).detalleId();
        en(m.negocioId(), () -> devolucionService.devolver(m.caja(), v.getId(), new DevolucionService.NuevaDevolucion(
                List.of(new DevolucionService.ItemDevolucion(linea, BigDecimal.ONE)), "EFECTIVO_USD", null)));
        var conDev = en(m.negocioId(), () -> reporteService.resumenDelDia(null));
        assertThat(conDev.gananciaUsd()).isEqualByComparingTo(antes.gananciaUsd().subtract(BigDecimal.ONE));
        assertThat(conDev.devolucionesUsd()).isEqualByComparingTo("2.00");
    }

    @Test
    void ventaDeLaColaSinInternetSeRegistraAunqueFalteStockOCambieElPrecio() {
        M m = montar("cola@ejemplo.com"); // stock 10, precio $2
        long haceUnaHora = System.currentTimeMillis() - 60 * 60 * 1000L;
        var item = new VentaService.ItemInput(m.productoId(), new BigDecimal("12"), new BigDecimal("1.50"), null); // cobró a $1,50
        Venta v = en(m.negocioId(), () -> ventaService.registrar(m.caja(), m.permiso(), new VentaService.VentaInput("COLA-1",
                new BigDecimal("40"), List.of(item), List.of(usd("18.00")), haceUnaHora)));
        assertThat(v.getTotalUsd()).isEqualByComparingTo("18.00");
        assertThat(producto(m).getStockActual()).isEqualByComparingTo("-2");
        // En vivo sigue siendo estricto.
        assertThatThrownBy(() -> vender(m, "VIVO-1", 1, null, usd("2.00"))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void anularCompraDevuelveElCostoAnterior() {
        M m = montar("anulcosto@ejemplo.com"); // 10 a $1
        var c = en(m.negocioId(), () -> compraService.registrar(m.dueno(), new CompraService.NuevaCompra(null, null, null, null, null, true, null,
                List.of(new CompraService.ItemCompra(m.productoId(), new BigDecimal("10"), new BigDecimal("2.00"), null)))));
        assertThat(producto(m).getCostoUsd()).isEqualByComparingTo("1.50");
        en(m.negocioId(), () -> compraService.anular(m.dueno(), c.compra().getId()));
        assertThat(producto(m).getCostoUsd()).isEqualByComparingTo("1.00");
        assertThat(producto(m).getStockActual()).isEqualByComparingTo("10");
    }

    @Test
    void anularPagoDeNominaDevuelveElFiadoALaCuenta() {
        M m = montar("anulnomina@ejemplo.com");
        var t = en(m.negocioId(), () -> clienteService.crear(new ClienteService.Datos("Pedro", null, null, null, null, "TRABAJADOR", new BigDecimal("50"))));
        en(m.negocioId(), () -> ventaService.fiarDesdeLibreta(m.dueno(), t.id(), new BigDecimal("40"),
                List.of(new VentaService.ItemInput(m.productoId(), new BigDecimal("3"), null, null)))); // $6
        var pago = en(m.negocioId(), () -> nominaService.pagar(m.dueno(), new com.kioskpos.web.nomina.NominaService.NuevoPago(t.id(), "Semana",
                new BigDecimal("50"), null, null, null, new BigDecimal("6"), "EFECTIVO_USD", null, null, null)));
        assertThat(en(m.negocioId(), () -> clienteService.saldoDe(t.id()))).isEqualByComparingTo("0");
        en(m.negocioId(), () -> nominaService.anular(m.dueno(), pago.pago().getId(), "Me equivoqué de monto"));
        assertThat(en(m.negocioId(), () -> clienteService.saldoDe(t.id()))).isEqualByComparingTo("6.00");
        assertThat(en(m.negocioId(), () -> nominaService.resumen()).pagadoEsteMesUsd()).isEqualByComparingTo("0");
        assertThatThrownBy(() -> en(m.negocioId(), () -> nominaService.anular(m.dueno(), pago.pago().getId(), "otra vez")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void noSePuedenRegistrarMasCajasDeLasContratadas() {
        M m = montar("limitecajas@ejemplo.com"); // ya tiene 1 caja y el plan incluye 1
        assertThatThrownBy(() -> en(m.negocioId(), () -> cajaService.registrar("Caja 2", null)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("Tu plan incluye 1 caja");
        assertThat(en(m.negocioId(), () -> cuadreService.resumen(m.turnoId())).fechaApertura()).isNotNull();
    }

    @Test
    void devolverEnTresPartesDevuelveExactoLoQuePago() {
        M m = montar("tercios@ejemplo.com"); // producto $2
        var item = new VentaService.ItemInput(m.productoId(), new BigDecimal("3"), null, null); // $6
        Venta v = en(m.negocioId(), () -> ventaService.registrar(m.caja(), m.permiso(), new VentaService.VentaInput("T3-1", new BigDecimal("40"),
                List.of(item), List.of(usd("2.00"), new VentaService.PagoInput(MetodoPago.PAGO_MOVIL, Moneda.VES, new BigDecimal("160.00"), "1234")))));
        Long linea = en(m.negocioId(), () -> devolucionService.detalle(v.getId())).lineas().get(0).detalleId();
        BigDecimal efectivo = BigDecimal.ZERO, movil = BigDecimal.ZERO;
        for (int i = 0; i < 3; i++) {
            var h = en(m.negocioId(), () -> devolucionService.devolver(m.caja(), v.getId(), new DevolucionService.NuevaDevolucion(
                    List.of(new DevolucionService.ItemDevolucion(linea, BigDecimal.ONE)), "COMO_PAGO", null)));
            for (var r : h.reembolsos()) {
                if (r.getMetodo().equals("EFECTIVO_USD")) efectivo = efectivo.add(r.getMonto());
                if (r.getMetodo().equals("PAGO_MOVIL")) movil = movil.add(r.getMonto());
            }
        }
        assertThat(efectivo).isEqualByComparingTo("2.00");
        assertThat(movil).isEqualByComparingTo("160.00");
    }
}
