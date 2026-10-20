package com.kioskpos.web.venta;

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
import com.kioskpos.web.permiso.PermisoDenegadoException;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.producto.Producto;
import com.kioskpos.web.producto.ProductoRepository;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * API de ventas (Paso 5): el servidor re-valida (recalcula precio, baja stock),
 * exige permiso de cobro y no cobra dos veces un reenvío (idempotencia).
 */
@SpringBootTest
class VentaServiceTest extends PostgresRlsTestBase {

    @Autowired
    private NegocioRegistroService negocioRegistroService;
    @Autowired
    private NegocioRepository negocioRepository;
    @Autowired
    private CajaService cajaService;
    @Autowired
    private UsuarioService usuarioService;
    @Autowired
    private ProductoRepository productoRepository;
    @Autowired
    private VentaService ventaService;
    @Autowired
    private PermisoService permisoService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private record Montado(Long negocioId, Long cajaId, Long cajeroId, String permiso, Long productoId) {
    }

    /** Crea negocio al día, una caja, un cajero y un producto con stock; devuelve un permiso vigente. */
    private Montado montar(String nombre, String email, BigDecimal precio, BigDecimal stock) {
        Long negocioId = negocioRegistroService
                .registrarNegocioConDueno(nombre, "Dueño", email, "clave-secreta").negocioId();
        Negocio n = negocioRepository.findById(negocioId).orElseThrow();
        n.setPagoHasta(LocalDate.now().plusDays(10)); // al día
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
            p.setNombre("Harina PAN");
            p.setPrecioUsd(precio);
            p.setStockActual(stock);
            p.setActivo(true);
            productoId = productoRepository.save(p).getId();
        } finally {
            NegocioContext.clear();
        }
        String permiso = permisoService.renovar(negocioId, cajaId).permiso();
        return new Montado(negocioId, cajaId, cajeroId, permiso, productoId);
    }

    private KioskPrincipal cajaPrincipal(Montado m) {
        return new KioskPrincipal(m.cajeroId(), m.negocioId(), RolUsuario.CAJERO, m.cajaId());
    }

    @Test
    void cobraYRecalculaConPrecioDelServidorYBajaStock() {
        Montado m = montar("Cocoa", "v1@ejemplo.com", new BigDecimal("2.00"), new BigDecimal("10"));
        var item = new VentaService.ItemInput(m.productoId(), new BigDecimal("3"),
                new BigDecimal("999.99"), null); // precio mentiroso del cliente: se ignora
        var pago = new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal("10.00"), null);

        Venta v;
        try {
            NegocioContext.set(m.negocioId());
            v = ventaService.registrar(cajaPrincipal(m), m.permiso(),
                    new VentaService.VentaInput("UUID-1", new BigDecimal("40.00"), List.of(item), List.of(pago)));
        } finally {
            NegocioContext.clear();
        }

        // 3 x $2.00 = $6.00 (precio del servidor, no el del request). Vuelto $4.00.
        assertThat(v.getTotalUsd()).isEqualByComparingTo("6.00");
        assertThat(v.getTotalBs()).isEqualByComparingTo("240.00");
        assertThat(v.getVueltoUsd()).isEqualByComparingTo("4.00");
        assertThat(v.getNumeroFactura()).isEqualTo(1);

        try {
            NegocioContext.set(m.negocioId());
            assertThat(productoRepository.findById(m.productoId()).orElseThrow().getStockActual())
                    .isEqualByComparingTo("7"); // 10 - 3
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void reenvioConMismoCodigoNoCobraDosVeces() {
        Montado m = montar("Cocoa", "v2@ejemplo.com", new BigDecimal("1.00"), new BigDecimal("10"));
        var item = new VentaService.ItemInput(m.productoId(), new BigDecimal("2"), null, null);
        var pago = new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal("2.00"), null);
        var input = new VentaService.VentaInput("UUID-DUP", new BigDecimal("40.00"), List.of(item), List.of(pago));

        Venta primera;
        Venta segunda;
        try {
            NegocioContext.set(m.negocioId());
            primera = ventaService.registrar(cajaPrincipal(m), m.permiso(), input);
            segunda = ventaService.registrar(cajaPrincipal(m), m.permiso(), input);
        } finally {
            NegocioContext.clear();
        }

        assertThat(segunda.getId()).isEqualTo(primera.getId()); // misma venta, no una nueva
        try {
            NegocioContext.set(m.negocioId());
            // El stock bajó una sola vez (10 - 2 = 8), no dos.
            assertThat(productoRepository.findById(m.productoId()).orElseThrow().getStockActual())
                    .isEqualByComparingTo("8");
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void pagoInsuficienteNoCobra() {
        Montado m = montar("Cocoa", "v3@ejemplo.com", new BigDecimal("5.00"), new BigDecimal("10"));
        var item = new VentaService.ItemInput(m.productoId(), new BigDecimal("2"), null, null); // $10
        var pago = new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal("3.00"), null);
        try {
            NegocioContext.set(m.negocioId());
            assertThatThrownBy(() -> ventaService.registrar(cajaPrincipal(m), m.permiso(),
                    new VentaService.VentaInput("UUID-3", new BigDecimal("40.00"), List.of(item), List.of(pago))))
                    .isInstanceOf(IllegalArgumentException.class);
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void sinPermisoVigenteNoCobra() {
        Montado m = montar("Cocoa", "v4@ejemplo.com", new BigDecimal("1.00"), new BigDecimal("10"));
        var item = new VentaService.ItemInput(m.productoId(), new BigDecimal("1"), null, null);
        var pago = new VentaService.PagoInput(MetodoPago.EFECTIVO_USD, Moneda.USD, new BigDecimal("1.00"), null);
        try {
            NegocioContext.set(m.negocioId());
            assertThatThrownBy(() -> ventaService.registrar(cajaPrincipal(m), "permiso-falso",
                    new VentaService.VentaInput("UUID-4", new BigDecimal("40.00"), List.of(item), List.of(pago))))
                    .isInstanceOf(PermisoDenegadoException.class);
        } finally {
            NegocioContext.clear();
        }
    }
}
