package com.kioskpos.web.cuadre;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
 * Cuadre (Paso 7): abrir turno, vender y cerrar. El vuelto sale de la caja (se resta
 * a lo esperado) y la apertura no se cuenta dos veces.
 */
@SpringBootTest
class CuadreServiceTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private NegocioRepository negocioRepository;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private ProductoRepository productoRepository;
    @Autowired private VentaService ventaService;
    @Autowired private PermisoService permisoService;
    @Autowired private CuadreService cuadreService;
    @Autowired private TurnoRepository turnoRepository;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private record Montado(Long negocioId, Long cajaId, Long cajeroId, String permiso, Long productoId) {
    }

    private Montado montar(String email) {
        Long negocioId = negocioRegistroService
                .registrarNegocioConDueno("Cocoa", "Dueño", email, "clave-secreta").negocioId();
        Negocio n = negocioRepository.findById(negocioId).orElseThrow();
        n.setPagoHasta(LocalDate.now().plusDays(10));
        negocioRepository.save(n);
        Long cajaId;
        Long cajeroId;
        Long productoId;
        try {
            NegocioContext.set(negocioId);
            cajaId = cajaService.registrar("Caja 1", null).caja().getId();
            cajeroId = usuarioService.crearCajero("Ana", "1234").getId();
            Producto p = new Producto();
            p.setNegocioId(negocioId);
            p.setCodigoBarras("A-1");
            p.setNombre("Harina");
            p.setPrecioUsd(new BigDecimal("3.00"));
            p.setStockActual(new BigDecimal("100"));
            p.setActivo(true);
            productoId = productoRepository.save(p).getId();
        } finally {
            NegocioContext.clear();
        }
        String permiso = permisoService.renovar(negocioId, cajaId).permiso();
        return new Montado(negocioId, cajaId, cajeroId, permiso, productoId);
    }

    @Test
    void cierreSimpleRestaElVueltoYNoDuplicaLaApertura() {
        Montado m = montar("cuadre1@ejemplo.com");
        KioskPrincipal caja = new KioskPrincipal(m.cajeroId(), m.negocioId(), RolUsuario.CAJERO, m.cajaId());

        try {
            NegocioContext.set(m.negocioId());
            // Abre con base $20.
            Turno turno = cuadreService.abrir(m.cajaId(), m.cajeroId(), new BigDecimal("20.00"), new BigDecimal("0"));

            // Vende 1 Harina ($3) y paga con $10 en efectivo USD -> vuelto $7.
            var item = new VentaService.ItemInput(m.productoId(), new BigDecimal("1"), null, null);
            var pago = new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal("10.00"), null);
            ventaService.registrar(caja, m.permiso(),
                    new VentaService.VentaInput("UUID-C1", new BigDecimal("40.00"), List.of(item), List.of(pago)));

            // Esperado USD = fondo 20 + efectivo 10 − vuelto 7 = 23 (la base NO se suma dos veces).
            var resumen = cuadreService.resumen(turno.getId());
            assertThat(resumen.efectivoUsd()).isEqualByComparingTo("10.00");
            assertThat(resumen.vueltoUsd()).isEqualByComparingTo("7.00");
            assertThat(resumen.esperadoUsd()).isEqualByComparingTo("23.00");

            // Cierra contando $23 -> cuadra (diferencia 0). Contando $25 -> sobrante $2.
            var cierre = cuadreService.cerrarSimple(turno.getId(), new BigDecimal("25.00"), new BigDecimal("0"));
            assertThat(cierre.estado()).isEqualTo("CERRADO");
            assertThat(cierre.diferenciaUsd()).isEqualByComparingTo("2.00");
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void noSePuedeAbrirDosTurnosEnLaMismaCaja() {
        Montado m = montar("cuadre2@ejemplo.com");
        try {
            NegocioContext.set(m.negocioId());
            cuadreService.abrir(m.cajaId(), m.cajeroId(), new BigDecimal("0"), new BigDecimal("0"));
            assertThatThrownBy(() -> cuadreService.abrir(m.cajaId(), m.cajeroId(), new BigDecimal("0"), new BigDecimal("0")))
                    .isInstanceOf(IllegalStateException.class);
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void resumenDetallaPagoMovilYFormasExtra() {
        Montado m = montar("cuadre3@ejemplo.com");
        KioskPrincipal caja = new KioskPrincipal(m.cajeroId(), m.negocioId(), RolUsuario.CAJERO, m.cajaId());
        try {
            NegocioContext.set(m.negocioId());
            Turno turno = cuadreService.abrir(m.cajaId(), m.cajeroId(), new BigDecimal("0"), new BigDecimal("0"));
            var item = new VentaService.ItemInput(m.productoId(), new BigDecimal("1"), null, null);
            // $3 a tasa 40 = Bs 120 por pago móvil.
            ventaService.registrar(caja, m.permiso(), new VentaService.VentaInput("UUID-C3a", new BigDecimal("40.00"), List.of(item),
                    List.of(new VentaService.PagoInput(MetodoPago.PAGO_MOVIL, Moneda.VES, new BigDecimal("120.00"), "1234"))));
            // $3 con una forma extra (Zelle) en dólares: se guarda como OTRO (requiere V9).
            ventaService.registrar(caja, m.permiso(), new VentaService.VentaInput("UUID-C3b", new BigDecimal("40.00"), List.of(item),
                    List.of(new VentaService.PagoInput(MetodoPago.OTRO, Moneda.USD, new BigDecimal("3.00"), "Zelle"))));

            var r = cuadreService.resumen(turno.getId());
            var porMetodo = r.metodos().stream().collect(java.util.stream.Collectors.toMap(CuadreService.MetodoLinea::metodo, CuadreService.MetodoLinea::esperado));
            assertThat(porMetodo.get("PAGO_MOVIL")).isEqualByComparingTo("120.00");
            assertThat(porMetodo.get("OTRO_USD")).isEqualByComparingTo("3.00");
            assertThat(porMetodo.get("EFECTIVO_USD")).isEqualByComparingTo("0.00");
            assertThat(porMetodo).doesNotContainKey("OTRO_BS");
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void cierreGuardaElArqueoYLasObservaciones() {
        Montado m = montar("cuadre4@ejemplo.com");
        try {
            NegocioContext.set(m.negocioId());
            Turno turno = cuadreService.abrir(m.cajaId(), m.cajeroId(), new BigDecimal("20.00"), new BigDecimal("0"));
            String detalle = "[{\"metodo\":\"EFECTIVO_USD\",\"contado\":18,\"diferencia\":-2}]";
            var cierre = cuadreService.cerrarSimple(turno.getId(), new BigDecimal("18.00"), new BigDecimal("0"), detalle, "  Faltan $2  ");
            assertThat(cierre.diferenciaUsd()).isEqualByComparingTo("-2.00");
            Turno guardado = turnoRepository.findById(turno.getId()).orElseThrow();
            assertThat(guardado.getArqueoDetalle()).isEqualTo(detalle);
            assertThat(guardado.getObservaciones()).isEqualTo("Faltan $2");
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void turnoAbiertoSeRecuperaDesdeElServidor() {
        Montado m = montar("cuadre5@ejemplo.com");
        try {
            NegocioContext.set(m.negocioId());
            assertThat(cuadreService.turnoAbierto(m.cajaId())).isEmpty();
            Turno turno = cuadreService.abrir(m.cajaId(), m.cajeroId(), new BigDecimal("0"), new BigDecimal("0"));
            assertThat(cuadreService.turnoAbierto(m.cajaId())).get().extracting(Turno::getId).isEqualTo(turno.getId());
            cuadreService.cerrarSimple(turno.getId(), BigDecimal.ZERO, BigDecimal.ZERO);
            assertThat(cuadreService.turnoAbierto(m.cajaId())).isEmpty();
        } finally {
            NegocioContext.clear();
        }
    }
}
