package com.kioskpos.web.nomina;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.cliente.ClienteService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import com.kioskpos.web.venta.VentaService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Nómina: el pago descuenta el fiado del trabajador y deja todo cuadrado. */
@SpringBootTest
class NominaServiceTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private ClienteService clienteService;
    @Autowired private VentaService ventaService;
    @Autowired private NominaService nominaService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    @Test
    void pagarNominaDescontandoElFiado() {
        var reg = negocioRegistroService.registrarNegocioConDueno("Nom", "Dueño", "nomina@ejemplo.com", "clave-secreta");
        Long neg = reg.negocioId();
        KioskPrincipal dueno = new KioskPrincipal(reg.duenoId(), neg, RolUsuario.DUENO, null);
        try {
            NegocioContext.set(neg);
            Producto p = new Producto();
            p.setNegocioId(neg);
            p.setCodigoBarras("NOM-1");
            p.setNombre("Harina PAN");
            p.setPrecioUsd(new BigDecimal("2.00"));
            p.setStockActual(new BigDecimal("50"));
            p.setActivo(true);
            Long prod = productoRepository.save(p).getId();
            var luis = clienteService.crear(new ClienteService.Datos("Luis", null, null, null, null, "TRABAJADOR", new BigDecimal("100")));
            // Se llevó 6 × $2 = $12 fiado.
            ventaService.fiarDesdeLibreta(dueno, luis.id(), new BigDecimal("40"),
                    List.of(new VentaService.ItemInput(prod, new BigDecimal("6"), null, null)));

            var r = nominaService.resumen();
            assertThat(r.trabajadores()).hasSize(1);
            assertThat(r.trabajadores().get(0).debeFiadoUsd()).isEqualByComparingTo("12.00");
            assertThat(r.trabajadores().get(0).netoSugeridoUsd()).isEqualByComparingTo("88.00");

            // No se puede descontar más fiado del que debe, ni dejar el neto negativo.
            assertThatThrownBy(() -> nominaService.pagar(dueno, new NominaService.NuevoPago(luis.id(), "Semana 1",
                    new BigDecimal("100"), null, null, null, new BigDecimal("20"), "EFECTIVO_USD", null, null, null)))
                    .isInstanceOf(IllegalArgumentException.class);
            assertThatThrownBy(() -> nominaService.pagar(dueno, new NominaService.NuevoPago(luis.id(), "Semana 1",
                    new BigDecimal("10"), null, null, null, new BigDecimal("12"), "EFECTIVO_USD", null, null, null)))
                    .isInstanceOf(IllegalArgumentException.class);

            // Sueldo 100 + bono 5 − adelanto 10 − fiado 12 = 83, pagado por pago móvil a tasa 40.
            var pago = nominaService.pagar(dueno, new NominaService.NuevoPago(luis.id(), "1ra quincena", new BigDecimal("100"),
                    new BigDecimal("5"), new BigDecimal("10"), "Adelanto", new BigDecimal("12"), "PAGO_MOVIL",
                    new BigDecimal("40"), "1234", null));
            assertThat(pago.pago().getNetoUsd()).isEqualByComparingTo("83.00");
            assertThat(pago.pago().getMoneda()).isEqualTo("VES");
            assertThat(pago.pago().getMontoPagado()).isEqualByComparingTo("3320.00");
            assertThat(clienteService.saldoDe(luis.id())).isEqualByComparingTo("0");

            var r2 = nominaService.resumen();
            assertThat(r2.pagadoEsteMesUsd()).isEqualByComparingTo("83.00");
            assertThat(r2.trabajadores().get(0).ultimoPeriodo()).isEqualTo("1ra quincena");
            assertThat(nominaService.historial(null)).hasSize(1);
            assertThat(nominaService.historial(luis.id()).get(0).trabajador()).isEqualTo("Luis");
        } finally {
            NegocioContext.clear();
        }
    }
}
