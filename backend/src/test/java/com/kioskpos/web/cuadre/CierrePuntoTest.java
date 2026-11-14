package com.kioskpos.web.cuadre;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.auth.RolUsuario;
import com.kioskpos.web.auth.UsuarioService;
import com.kioskpos.web.auth.security.KioskPrincipal;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** El cajero copia el ticket de cierre del punto; queda en su turno y el dueño lo ve por fecha (aislado por negocio). */
@SpringBootTest
class CierrePuntoTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private CajaService cajaService;
    @Autowired private UsuarioService usuarioService;
    @Autowired private CuadreService cuadreService;
    @Autowired private CierrePuntoService cierrePuntoService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private record M(Long negocioId, KioskPrincipal caja, KioskPrincipal dueno, Long turnoId) {
    }

    private M montar(String email) {
        var reg = negocioRegistroService.registrarNegocioConDueno("Neg " + email, "Dueño", email, "clave-secreta");
        Long neg = reg.negocioId();
        return en(neg, () -> {
            Long cajaId = cajaService.registrar("Caja 1", null).caja().getId();
            Long cajeroId = usuarioService.crearCajero("Ana", "1234").getId();
            Long turno = cuadreService.abrir(cajaId, cajeroId, BigDecimal.ZERO, BigDecimal.ZERO).getId();
            return new M(neg, new KioskPrincipal(cajeroId, neg, RolUsuario.CAJERO, cajaId),
                    new KioskPrincipal(reg.duenoId(), neg, RolUsuario.DUENO, null), turno);
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

    private static CierrePuntoService.Nuevo ticket() {
        // Como el ticket de la foto: débito 6 compras Bs 29.983, Master/Visa 6 compras Bs 6.934.
        return new CierrePuntoService.Nuevo("PUNTO", "EPN DIEGO HERNANDEZ CRE", "0078847603", "000407", "000407", "000407",
                Instant.parse("2026-11-06T22:33:20Z"),
                new CierrePuntoService.Seccion(0, BigDecimal.ZERO, 0, BigDecimal.ZERO),
                new CierrePuntoService.Seccion(6, new BigDecimal("29983.00"), 0, BigDecimal.ZERO),
                new CierrePuntoService.Seccion(6, new BigDecimal("6934.00"), 0, BigDecimal.ZERO), null);
    }

    @Test
    void elCajeroLoAnotaEnSuTurnoYElDuenoLoVePorFecha() {
        M m = montar("punto1@ejemplo.com");
        CierrePunto c = en(m.negocioId(), () -> cierrePuntoService.registrar(m.caja(), ticket()));
        assertThat(c.getTotalBs()).isEqualByComparingTo("36917.00");
        assertThat(c.getTurnoId()).isEqualTo(m.turnoId());
        assertThat(en(m.negocioId(), () -> cierrePuntoService.delTurno(m.turnoId()))).hasSize(1);

        var vistas = en(m.negocioId(), () -> cierrePuntoService.entre(LocalDate.of(2026, 11, 6), LocalDate.of(2026, 11, 6)));
        assertThat(vistas).hasSize(1);
        assertThat(vistas.get(0).caja()).isEqualTo("Caja 1");
        assertThat(vistas.get(0).cajero()).isEqualTo("Ana");
        assertThat(vistas.get(0).sistemaBs()).isEqualByComparingTo("0");

        // Otro negocio no lo ve (RLS).
        M otro = montar("punto2@ejemplo.com");
        assertThat(en(otro.negocioId(), () -> cierrePuntoService.entre(LocalDate.of(2026, 11, 6), LocalDate.of(2026, 11, 6)))).isEmpty();
        assertThatThrownBy(() -> en(otro.negocioId(), () -> { cierrePuntoService.borrar(otro.dueno(), c.getId()); return null; }))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void elDuenoVeLosCierresDeCajaConCajaCajeroYCuadre() {
        M m = montar("cierrecaja@ejemplo.com");
        en(m.negocioId(), () -> cuadreService.cerrarSimple(m.turnoId(), new BigDecimal("5"), BigDecimal.ZERO, null, null));
        var hoy = java.time.LocalDate.now(CierrePuntoService.ZONA);
        var l = en(m.negocioId(), () -> cierrePuntoService.cierresDeCaja(hoy, hoy));
        assertThat(l).hasSize(1);
        var c = l.get(0);
        assertThat(c.turnoId()).isEqualTo(m.turnoId());
        assertThat(c.caja()).isNotBlank();
        assertThat(c.cajero()).isNotBlank();
        assertThat(c.fechaCierre()).isNotNull();
        assertThat(c.cuadre().diferenciaUsd()).isEqualByComparingTo("5"); // contó $5 de más (fondo 0, sin ventas)
        // Otro negocio no lo ve.
        M otro = montar("cierrecaja2@ejemplo.com");
        assertThat(en(otro.negocioId(), () -> cierrePuntoService.cierresDeCaja(hoy, hoy))).isEmpty();
    }

    @Test
    void validaElTicketYSoloBorraElDuenoTrasCerrar() {
        M m = montar("punto3@ejemplo.com");
        assertThatThrownBy(() -> en(m.negocioId(), () -> cierrePuntoService.registrar(m.caja(), new CierrePuntoService.Nuevo(
                "PUNTO", null, null, null, null, null, null, null,
                new CierrePuntoService.Seccion(1, new BigDecimal("10"), 0, new BigDecimal("20")), null, null))))
                .hasMessageContaining("anulaciones");
        CierrePunto c = en(m.negocioId(), () -> cierrePuntoService.registrar(m.caja(), ticket()));
        en(m.negocioId(), () -> cuadreService.cerrarSimple(m.turnoId(), BigDecimal.ZERO, BigDecimal.ZERO, null, null));
        assertThatThrownBy(() -> en(m.negocioId(), () -> { cierrePuntoService.borrar(m.caja(), c.getId()); return null; }))
                .hasMessageContaining("turno abierto");
        en(m.negocioId(), () -> { cierrePuntoService.borrar(m.dueno(), c.getId()); return null; });
        assertThat(en(m.negocioId(), () -> cierrePuntoService.delTurno(m.turnoId()))).isEmpty();
    }
}
