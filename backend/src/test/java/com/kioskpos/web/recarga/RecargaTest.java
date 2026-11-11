package com.kioskpos.web.recarga;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cuadre.CuadreService;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.reporte.ReporteService;
import com.kioskpos.web.tenant.NegocioContext;
import com.kioskpos.web.venta.MetodoPago;
import com.kioskpos.web.venta.Moneda;
import com.kioskpos.web.venta.VentaService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Recargas de saldo en el cuadre y en el reporte; reporte por rango y más vendidos. */
@SpringBootTest
class RecargaTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private NegocioRepository negocioRepository;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private CuadreService cuadreService;
    @Autowired private RecargaService recargaService;
    @Autowired private ReporteService reporteService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private PermisoService permisoService;
    @Autowired private VentaService ventaService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private record M(Long negocioId, KioskPrincipal caja, Long turnoId) {
    }

    private M montar(String email) {
        Long neg = negocioRegistroService.registrarNegocioConDueno("Neg " + email, "Dueño", email, "clave-secreta").negocioId();
        Negocio n = negocioRepository.findById(neg).orElseThrow();
        n.setPagoHasta(LocalDate.now().plusDays(10));
        negocioRepository.save(n);
        return en(neg, () -> {
            Long cajaId = cajaService.registrar("Caja 1", null).caja().getId();
            Long cajeroId = usuarioService.crearCajero("Ana", "1234").getId();
            Long turno = cuadreService.abrir(cajaId, cajeroId, new BigDecimal("20"), new BigDecimal("5000")).getId();
            return new M(neg, new KioskPrincipal(cajeroId, neg, RolUsuario.CAJERO, cajaId), turno);
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

    private Recarga recargar(M m, String operadora, String montoBs, String metodo, String cobrado) {
        return en(m.negocioId(), () -> recargaService.registrar(m.caja(), new RecargaService.Nueva(
                operadora, "0414-1234567", new BigDecimal(montoBs), metodo, new BigDecimal(cobrado), new BigDecimal("40"), null)));
    }

    private BigDecimal metodo(CuadreService.Resumen r, String metodo) {
        return r.metodos().stream().filter(x -> x.metodo().equals(metodo)).findFirst().orElseThrow().esperado();
    }

    @Test
    void loCobradoEntraASuFormaDePagoYLaComisionSeCalcula() {
        M m = montar("rec1@ejemplo.com");
        Recarga ef = recargar(m, "movistar", "400", "EFECTIVO_BS", "440");
        assertThat(ef.getComisionBs()).isEqualByComparingTo("40");
        assertThat(ef.getOperadora()).isEqualTo("MOVISTAR");
        recargar(m, "DIGITEL", "200", "PAGO_MOVIL", "220");
        Recarga usd = recargar(m, "MOVILNET", "400", "EFECTIVO_USD", "10.5"); // 10,5 × 40 = 420
        assertThat(usd.getComisionBs()).isEqualByComparingTo("20");

        CuadreService.Resumen r = en(m.negocioId(), () -> cuadreService.resumen(m.turnoId()));
        assertThat(r.esperadoBs()).isEqualByComparingTo("5440");
        assertThat(r.esperadoUsd()).isEqualByComparingTo("30.50");
        assertThat(metodo(r, "PAGO_MOVIL")).isEqualByComparingTo("220");
        assertThat(r.recargasBs()).isEqualByComparingTo("1000");
        assertThat(r.comisionRecargasBs()).isEqualByComparingTo("80");

        ReporteService.ResumenDia dia = en(m.negocioId(), () -> reporteService.resumenDelDia(LocalDate.now(ZoneId.of("America/Caracas"))));
        assertThat(dia.cantidadRecargas()).isEqualTo(3);
        assertThat(dia.comisionRecargasBs()).isEqualByComparingTo("80");
    }

    @Test
    void noSeCobraMenosDeLoRecargadoYSoloSeAnulaDesdeSuCaja() {
        M m = montar("rec2@ejemplo.com");
        assertThatThrownBy(() -> recargar(m, "MOVISTAR", "400", "EFECTIVO_BS", "300"))
                .hasMessageContaining("no puede ser menor");
        assertThatThrownBy(() -> recargar(m, "PATITO", "400", "EFECTIVO_BS", "400"))
                .hasMessageContaining("operadora");
        Recarga r = recargar(m, "MOVISTAR", "400", "EFECTIVO_BS", "400");
        KioskPrincipal otraCaja = new KioskPrincipal(m.caja().usuarioId(), m.negocioId(), RolUsuario.CAJERO, m.caja().cajaId() + 999);
        assertThatThrownBy(() -> en(m.negocioId(), () -> recargaService.anular(otraCaja, r.getId())))
                .hasMessageContaining("caja donde se hizo");
        en(m.negocioId(), () -> recargaService.anular(m.caja(), r.getId()));
        CuadreService.Resumen res = en(m.negocioId(), () -> cuadreService.resumen(m.turnoId()));
        assertThat(res.esperadoBs()).isEqualByComparingTo("5000");

        // Otro negocio no ve las recargas de este (RLS).
        M otro = montar("rec3@ejemplo.com");
        assertThat(en(otro.negocioId(), () -> recargaService.delTurno(m.turnoId()))).isEmpty();
    }

    @Test
    void reportePorRangoTraeDiaPorDiaYLosMasVendidos() {
        M m = montar("rec4@ejemplo.com");
        Long prod = en(m.negocioId(), () -> {
            Producto p = new Producto();
            p.setNegocioId(m.negocioId());
            p.setCodigoBarras("R-1");
            p.setNombre("Harina PAN");
            p.setPrecioUsd(new BigDecimal("2.00"));
            p.setCostoUsd(new BigDecimal("1.50"));
            p.setStockActual(new BigDecimal("100"));
            p.setActivo(true);
            return productoRepository.save(p).getId();
        });
        String permiso = permisoService.renovar(m.negocioId(), m.caja().cajaId()).permiso();
        en(m.negocioId(), () -> ventaService.registrar(m.caja(), permiso, new VentaService.VentaInput("rango-1", new BigDecimal("40"),
                List.of(new VentaService.ItemInput(prod, new BigDecimal("3"), null, null)),
                List.of(new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal("6"), null)), null, null)));

        LocalDate hoy = LocalDate.now(ZoneId.of("America/Caracas"));
        ReporteService.ResumenDia semana = en(m.negocioId(), () -> reporteService.resumenEntre(hoy.minusDays(6), hoy));
        assertThat(semana.porDia()).hasSize(7);
        assertThat(semana.porDia().get(6).totalUsd()).isEqualByComparingTo("6");
        assertThat(semana.porDia().get(6).gananciaUsd()).isEqualByComparingTo("1.5");
        assertThat(semana.masVendidos()).hasSize(1);
        assertThat(semana.masVendidos().get(0).nombre()).isEqualTo("Harina PAN");
        assertThat(semana.masVendidos().get(0).cantidad()).isEqualByComparingTo("3");
        assertThat(semana.masVendidos().get(0).gananciaUsd()).isEqualByComparingTo("1.5");
        assertThatThrownBy(() -> en(m.negocioId(), () -> reporteService.resumenEntre(hoy, hoy.minusDays(1))))
                .hasMessageContaining("antes");
    }
}
