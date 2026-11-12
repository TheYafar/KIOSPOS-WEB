package com.kioskpos.web.venta;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cliente.ClienteService;
import com.kioskpos.web.cliente.TrabajadorSyncService;
import com.kioskpos.web.cuadre.CuadreService;
import com.kioskpos.web.devolucion.DevolucionService;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.recarga.RecargaRepository;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Recargas y avances se cobran junto con los productos, en una sola cuenta, sin descuadrar la caja. */
@SpringBootTest
class ServiciosEnVentaTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private NegocioRepository negocioRepository;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private PermisoService permisoService;
    @Autowired private CuadreService cuadreService;
    @Autowired private VentaService ventaService;
    @Autowired private DevolucionService devolucionService;
    @Autowired private RecargaRepository recargaRepository;
    @Autowired private TrabajadorSyncService trabajadorSync;
    @Autowired private ClienteService clienteService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private record M(Long negocioId, KioskPrincipal caja, String permiso, Long productoId, Long turnoId) {
    }

    private M montar(String email) {
        var reg = negocioRegistroService.registrarNegocioConDueno("Neg " + email, "Dueño", email, "clave-secreta");
        Long neg = reg.negocioId();
        Negocio n = negocioRepository.findById(neg).orElseThrow();
        n.setPagoHasta(LocalDate.now().plusDays(10));
        negocioRepository.save(n);
        return en(neg, () -> {
            Long cajaId = cajaService.registrar("Caja 1", null).caja().getId();
            Long cajeroId = usuarioService.crearCajero("Ana Pérez", "1234").getId();
            Producto p = new Producto();
            p.setNegocioId(neg);
            p.setCodigoBarras("S-" + email);
            p.setNombre("Cigarro");
            p.setPrecioUsd(new BigDecimal("1.00"));
            p.setStockActual(new BigDecimal("10"));
            p.setActivo(true);
            Long prod = productoRepository.save(p).getId();
            Long turno = cuadreService.abrir(cajaId, cajeroId, BigDecimal.ZERO, new BigDecimal("2000")).getId();
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

    private BigDecimal esperado(M m, String metodo) {
        return en(m.negocioId(), () -> cuadreService.resumen(m.turnoId()).metodos().stream()
                .filter(x -> x.metodo().equals(metodo)).findFirst().orElseThrow().esperado());
    }

    @Test
    void productoRecargaYAvanceEnUnaSolaCuentaPorPunto() {
        M m = montar("serv1@ejemplo.com");
        // Tasa 40: cigarro $1 = Bs 40; recarga Bs 500 cobrada en Bs 600; avance Bs 1000 cobrado en Bs 1100.
        var servicios = List.of(
                new VentaService.ServicioInput("RECARGA", "DIGITEL", "0412-1234567", new BigDecimal("500"), null, null, new BigDecimal("600")),
                new VentaService.ServicioInput("AVANCE", null, null, null, "VES", new BigDecimal("1000"), new BigDecimal("1100")));
        var pago = new VentaService.PagoInput(MetodoPago.PUNTO, Moneda.VES, new BigDecimal("1740"), null);
        Venta v = en(m.negocioId(), () -> ventaService.registrar(m.caja(), m.permiso(), new VentaService.VentaInput("SV-1", new BigDecimal("40"),
                List.of(new VentaService.ItemInput(m.productoId(), BigDecimal.ONE, null, null)), List.of(pago), null, null, servicios)));

        assertThat(v.getTotalBs()).isEqualByComparingTo("1740.00"); // 40 + 600 + 1100, exacto
        assertThat(v.getDetalles()).hasSize(3);
        assertThat(v.getDetalles().get(1).getNombre()).isEqualTo("Recarga DIGITEL 0412-1234567");
        assertThat(v.getDetalles().get(1).getMontoBs()).isEqualByComparingTo("600");
        // Cuadre: el punto cobró todo una sola vez; de la gaveta salieron los Bs 1000 del avance.
        assertThat(esperado(m, "PUNTO")).isEqualByComparingTo("1740.00");
        assertThat(esperado(m, "EFECTIVO_BS")).isEqualByComparingTo("1000.00");
        var res = en(m.negocioId(), () -> cuadreService.resumen(m.turnoId()));
        assertThat(res.comisionRecargasBs()).isEqualByComparingTo("100.00");
        assertThat(res.comisionAvancesBs()).isEqualByComparingTo("100.00");

        // Las líneas de servicio no se devuelven; anular la venta deshace todo.
        Long lineaRecarga = v.getDetalles().get(1).getId();
        assertThatThrownBy(() -> en(m.negocioId(), () -> devolucionService.devolver(m.caja(), v.getId(), new DevolucionService.NuevaDevolucion(
                List.of(new DevolucionService.ItemDevolucion(lineaRecarga, BigDecimal.ONE)), "EFECTIVO_BS", null))))
                .hasMessageContaining("no se devuelven");
        en(m.negocioId(), () -> devolucionService.anular(m.caja(), v.getId(), "Error"));
        assertThat(esperado(m, "PUNTO")).isEqualByComparingTo("0.00");
        assertThat(esperado(m, "EFECTIVO_BS")).isEqualByComparingTo("2000.00");
        assertThat(en(m.negocioId(), () -> recargaRepository.findByVentaId(v.getId())).get(0).isAnulada()).isTrue();
    }

    @Test
    void noCubreSiPaganMenosDeLoExactoEnBsYNoDaMasEfectivoDelQueHay() {
        M m = montar("serv2@ejemplo.com");
        var recarga = new VentaService.ServicioInput("RECARGA", "MOVISTAR", "04141234567", new BigDecimal("500"), null, null, new BigDecimal("600"));
        assertThatThrownBy(() -> en(m.negocioId(), () -> ventaService.registrar(m.caja(), m.permiso(), new VentaService.VentaInput("SV-2", new BigDecimal("40"),
                List.of(), List.of(new VentaService.PagoInput(MetodoPago.PUNTO, Moneda.VES, new BigDecimal("599.99"), null)), null, null, List.of(recarga)))))
                .hasMessageContaining("Pago insuficiente");
        var avance = new VentaService.ServicioInput("AVANCE", null, null, null, "VES", new BigDecimal("5000"), new BigDecimal("5500"));
        assertThatThrownBy(() -> en(m.negocioId(), () -> ventaService.registrar(m.caja(), m.permiso(), new VentaService.VentaInput("SV-3", new BigDecimal("40"),
                List.of(), List.of(new VentaService.PagoInput(MetodoPago.PUNTO, Moneda.VES, new BigDecimal("5500"), null)), null, null, List.of(avance)))))
                .hasMessageContaining("no hay suficiente efectivo");
    }

    @Test
    void elCajeroApareceComoTrabajadorParaCreditoYNomina() {
        M m = montar("serv3@ejemplo.com");
        en(m.negocioId(), () -> { trabajadorSync.asegurar(); trabajadorSync.asegurar(); return null; });
        var trabajadores = en(m.negocioId(), () -> clienteService.listar(null, "TRABAJADOR"));
        assertThat(trabajadores).extracting(t -> t.nombre()).containsExactly("Ana Pérez");
    }
}
