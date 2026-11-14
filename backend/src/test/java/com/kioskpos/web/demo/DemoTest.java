package com.kioskpos.web.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.admin.AdminService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.JwtService;
import com.kioskpos.web.cliente.ClienteService;
import com.kioskpos.web.compra.CompraService;
import com.kioskpos.web.inventario.InventarioService;
import com.kioskpos.web.reporte.ReporteService;
import com.kioskpos.web.suscripcion.SuscripcionService;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** "Probar la demo": bodega de muestra propia, llena y con límites. */
@SpringBootTest
class DemoTest extends PostgresRlsTestBase {

    @Autowired private DemoService demo;
    @Autowired private JwtService jwt;
    @Autowired private InventarioService inventario;
    @Autowired private ReporteService reportes;
    @Autowired private ClienteService clientes;
    @Autowired private CompraService compras;
    @Autowired private UsuarioService usuarios;
    @Autowired private SuscripcionService suscripcion;
    @Autowired private AdminService admin;

    private static <T> T en(Long negocioId, Supplier<T> f) {
        try {
            NegocioContext.set(negocioId);
            return f.get();
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void creaUnaBodegaDeMuestraLlenaYAislada() {
        var d = demo.crear("10.5.5.1");
        Long neg = d.dueno().negocioId();
        assertThat(d.dueno().rol()).isEqualTo(RolUsuario.DUENO);
        assertThat(d.cajero().rol()).isEqualTo(RolUsuario.CAJERO);
        assertThat(d.cajero().cajaId()).isNotNull();
        assertThat(jwt.validar(d.cajero().token()).cajaId()).isEqualTo(d.cajero().cajaId());

        assertThat(en(neg, () -> inventario.listar())).hasSizeGreaterThanOrEqualTo(15);
        var hoy = en(neg, () -> reportes.resumenDelDia(null));
        assertThat(hoy.cantidadVentas()).isGreaterThanOrEqualTo(7);
        assertThat(en(neg, () -> clientes.listar(null))).anyMatch(c -> c.saldoUsd().signum() > 0);
        assertThat(en(neg, () -> compras.pagosPendientes())).isNotEmpty();

        // Otra demo es otra bodega: no ve lo de la primera.
        var otra = demo.crear("10.5.5.2");
        assertThat(otra.dueno().negocioId()).isNotEqualTo(neg);

        // No sale en el panel del super admin.
        assertThat(admin.listarNegocios()).noneMatch(n -> n.situacion().negocioId().equals(neg));
    }

    @Test
    void enLaDemoNoSeCreanCuentasConCorreoNiSeReportanPagos() {
        var d = demo.crear("10.5.5.3");
        Long neg = d.dueno().negocioId();
        assertThatThrownBy(() -> en(neg, () -> usuarios.crearConCorreo("X", RolUsuario.ENCARGADO, "real@ejemplo.com", "clave-segura")))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> suscripcion.reportarPago(neg, new BigDecimal("25"), "USD", "PAGO_MOVIL", "123", 1))
                .isInstanceOf(IllegalStateException.class);
    }
}
