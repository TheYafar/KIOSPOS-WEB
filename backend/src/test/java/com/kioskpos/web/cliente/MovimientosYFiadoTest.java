package com.kioskpos.web.cliente;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cuadre.CuadreService;
import com.kioskpos.web.cuadre.MovimientoCaja;
import com.kioskpos.web.cuadre.MovimientoCajaService;
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

/** Sección 4: gastos/retiros/ingresos/avances en el cuadre, y fiado con abonos. */
@SpringBootTest
class MovimientosYFiadoTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private NegocioRepository negocioRepository;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private PermisoService permisoService;
    @Autowired private CuadreService cuadreService;
    @Autowired private MovimientoCajaService movimientoCajaService;
    @Autowired private ClienteService clienteService;
    @Autowired private VentaService ventaService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private record M(Long negocioId, KioskPrincipal caja, String permiso, Long productoId, Long turnoId) {
    }

    /** Negocio al día, caja con turno abierto (fondo $20 y Bs 5.000) y un producto de $2. */
    private M montar(String email) {
        Long neg = negocioRegistroService.registrarNegocioConDueno("Neg " + email, "Dueño", email, "clave-secreta").negocioId();
        Negocio n = negocioRepository.findById(neg).orElseThrow();
        n.setPagoHasta(LocalDate.now().plusDays(10));
        negocioRepository.save(n);
        return en(neg, () -> {
            Long cajaId = cajaService.registrar("Caja 1", null).caja().getId();
            Long cajeroId = usuarioService.crearCajero("Ana", "1234").getId();
            Producto p = new Producto();
            p.setNegocioId(neg);
            p.setCodigoBarras("P-" + email);
            p.setNombre("Harina PAN");
            p.setPrecioUsd(new BigDecimal("2.00"));
            p.setStockActual(new BigDecimal("100"));
            p.setActivo(true);
            Long prod = productoRepository.save(p).getId();
            Long turno = cuadreService.abrir(cajaId, cajeroId, new BigDecimal("20"), new BigDecimal("5000")).getId();
            return new M(neg, new KioskPrincipal(cajeroId, neg, RolUsuario.CAJERO, cajaId),
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

    private MovimientoCaja mov(M m, MovimientoCaja.Tipo tipo, String moneda, String monto, String concepto,
                               String metodo, String cobrado) {
        return en(m.negocioId(), () -> movimientoCajaService.registrar(m.caja(), new MovimientoCajaService.Nuevo(
                tipo, moneda, new BigDecimal(monto), concepto, metodo, cobrado == null ? null : new BigDecimal(cobrado),
                new BigDecimal("40"))));
    }

    private CuadreService.Resumen resumen(M m) {
        return en(m.negocioId(), () -> cuadreService.resumen(m.turnoId()));
    }

    private BigDecimal digital(CuadreService.Resumen r, String metodo) {
        return r.metodos().stream().filter(x -> x.metodo().equals(metodo)).findFirst().orElseThrow().esperado();
    }

    private Venta vender(M m, String codigo, int cantidad, Long clienteId, VentaService.PagoInput... pagos) {
        var item = new VentaService.ItemInput(m.productoId(), new BigDecimal(cantidad), null, null);
        return en(m.negocioId(), () -> ventaService.registrar(m.caja(), m.permiso(),
                new VentaService.VentaInput(codigo, new BigDecimal("40"), List.of(item), List.of(pagos), null, clienteId)));
    }

    private static VentaService.PagoInput pago(MetodoPago metodo, Moneda moneda, String monto) {
        return new VentaService.PagoInput(metodo, moneda, new BigDecimal(monto), null);
    }

    @Test
    void gastosRetirosIngresosYAvancesCambianLoEsperadoEnGaveta() {
        M m = montar("mov1@ejemplo.com");
        mov(m, MovimientoCaja.Tipo.GASTO, "USD", "5", "Hielo", null, null);
        mov(m, MovimientoCaja.Tipo.RETIRO, "USD", "3", "Retiro del dueño", null, null);
        mov(m, MovimientoCaja.Tipo.INGRESO, "VES", "500", "Sencillo para vueltos", null, null);
        MovimientoCaja av = mov(m, MovimientoCaja.Tipo.AVANCE, "VES", "1000", "", "PUNTO", "1100");
        assertThat(av.getComision()).isEqualByComparingTo("100");
        assertThat(av.getConcepto()).isEqualTo("Avance de efectivo");

        var r = resumen(m);
        assertThat(r.esperadoUsd()).isEqualByComparingTo("12.00");   // 20 − 5 − 3
        assertThat(r.esperadoBs()).isEqualByComparingTo("4500.00");  // 5000 + 500 − 1000
        assertThat(digital(r, "PUNTO")).isEqualByComparingTo("1100.00");
        assertThat(r.comisionAvancesBs()).isEqualByComparingTo("100.00");
        assertThat(r.movimientos()).anySatisfy(l -> {
            assertThat(l.tipo()).isEqualTo("GASTO");
            assertThat(l.total()).isEqualByComparingTo("5.00");
        });

        // No puede salir más efectivo del que hay; sin concepto no se acepta; lo cobrado no baja de lo entregado.
        assertThatThrownBy(() -> mov(m, MovimientoCaja.Tipo.GASTO, "USD", "50", "Algo", null, null))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("No hay suficiente efectivo");
        assertThatThrownBy(() -> mov(m, MovimientoCaja.Tipo.GASTO, "USD", "1", " ", null, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> mov(m, MovimientoCaja.Tipo.AVANCE, "VES", "1000", "", "PUNTO", "900"))
                .isInstanceOf(IllegalArgumentException.class);

        // Anular el gasto devuelve el dinero a lo esperado.
        Long gastoId = en(m.negocioId(), () -> movimientoCajaService.delTurno(m.turnoId())).get(0).getId();
        en(m.negocioId(), () -> movimientoCajaService.anular(gastoId));
        assertThat(resumen(m).esperadoUsd()).isEqualByComparingTo("17.00");
    }

    @Test
    void fiadoConLimiteYAbonosQueEntranAlCuadre() {
        M m = montar("fiado1@ejemplo.com");
        var maria = en(m.negocioId(), () -> clienteService.crear(new ClienteService.Datos("María", "V-12.345.678", "0412", new BigDecimal("10"), null)));
        assertThat(maria.cedula()).isEqualTo("V12345678");

        // $6 fiado completo.
        Venta v1 = vender(m, "F-1", 3, maria.id(), pago(MetodoPago.FIADO, Moneda.USD, "6.00"));
        assertThat(v1.getClienteId()).isEqualTo(maria.id());
        assertThat(v1.getVueltoUsd()).isEqualByComparingTo("0");
        // Otros $6 pasan su límite de $10.
        assertThatThrownBy(() -> vender(m, "F-2", 3, maria.id(), pago(MetodoPago.FIADO, Moneda.USD, "6.00")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("límite");
        // Fiado sin cliente: no.
        assertThatThrownBy(() -> vender(m, "F-3", 1, null, pago(MetodoPago.FIADO, Moneda.USD, "2.00")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("elegir el cliente");
        // Mixto: paga $1 en efectivo y fía $3 (venta de $4).
        vender(m, "F-4", 2, maria.id(), pago(MetodoPago.EFECTIVO_USD, Moneda.USD, "1.00"), pago(MetodoPago.FIADO, Moneda.USD, "3.00"));

        var d = en(m.negocioId(), () -> clienteService.detalle(maria.id()));
        assertThat(d.cliente().saldoUsd()).isEqualByComparingTo("9.00");
        assertThat(d.movimientos()).hasSize(2);

        // Abona Bs 200 (= $5 a tasa 40) en efectivo: entra a la gaveta en Bs.
        en(m.negocioId(), () -> clienteService.abonar(m.caja(), maria.id(),
                new ClienteService.Abono("EFECTIVO_BS", new BigDecimal("200"), new BigDecimal("40"), null, null)));
        assertThat(en(m.negocioId(), () -> clienteService.detalle(maria.id())).cliente().saldoUsd()).isEqualByComparingTo("4.00");
        // No puede abonar más de lo que debe.
        assertThatThrownBy(() -> en(m.negocioId(), () -> clienteService.abonar(m.caja(), maria.id(),
                new ClienteService.Abono("EFECTIVO_USD", new BigDecimal("10"), null, null, null))))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("mayor que la deuda");

        var r = resumen(m);
        assertThat(r.fiadoUsd()).isEqualByComparingTo("9.00");
        assertThat(r.esperadoUsd()).isEqualByComparingTo("21.00");  // 20 + 1 cobrado
        assertThat(r.esperadoBs()).isEqualByComparingTo("5200.00"); // 5000 + 200 abono

        // La lista pone primero a quien debe.
        var lista = en(m.negocioId(), () -> clienteService.listar(null));
        assertThat(lista.get(0).nombre()).isEqualTo("María");
        assertThat(en(m.negocioId(), () -> clienteService.listar("12345"))).hasSize(1);
    }

    @Test
    void elFiadoDeUnNegocioNoSeVeDesdeOtro() {
        M a = montar("fiadoA@ejemplo.com");
        M b = montar("fiadoB@ejemplo.com");
        var cli = en(a.negocioId(), () -> clienteService.crear(new ClienteService.Datos("Pedro", null, null, null, null)));
        assertThat(en(b.negocioId(), () -> clienteService.listar(null))).isEmpty();
        assertThatThrownBy(() -> en(b.negocioId(), () -> clienteService.detalle(cli.id())))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
