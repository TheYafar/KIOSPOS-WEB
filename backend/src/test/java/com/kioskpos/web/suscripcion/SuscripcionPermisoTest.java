package com.kioskpos.web.suscripcion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.CajaService;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import com.kioskpos.web.permiso.PermisoDenegadoException;
import com.kioskpos.web.permiso.PermisoService;
import com.kioskpos.web.tenant.NegocioContext;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * El corazón del negocio (Paso 4): la escalera de corte por falta de pago y el
 * permiso de cobro (kill switch) que solo se renueva si el negocio está al día.
 */
@SpringBootTest
class SuscripcionPermisoTest extends PostgresRlsTestBase {

    @Autowired
    private NegocioRegistroService negocioRegistroService;
    @Autowired
    private NegocioRepository negocioRepository;
    @Autowired
    private SuscripcionService suscripcionService;
    @Autowired
    private PermisoService permisoService;
    @Autowired
    private CajaService cajaService;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private Long nuevoNegocio(String nombre, String email) {
        return negocioRegistroService
                .registrarNegocioConDueno(nombre, "Dueño", email, "clave-secreta")
                .negocioId();
    }

    private void ponerPagoHasta(Long negocioId, LocalDate fecha) {
        Negocio n = negocioRepository.findById(negocioId).orElseThrow();
        n.setPagoHasta(fecha);
        n.setEstado("ACTIVA");
        n.setEnPrueba(false); // cliente que ya pagó alguna vez (tiene días de gracia)
        negocioRepository.save(n);
    }

    @Test
    void escaleraDeCorteSegunDiasVencido() {
        Long neg = nuevoNegocio("Cocoa", "esc@ejemplo.com");
        LocalDate hoy = com.kioskpos.web.Fechas.hoy();

        // Al día -> ACTIVA, cobra.
        ponerPagoHasta(neg, hoy.plusDays(10));
        var alDia = suscripcionService.situacion(neg);
        assertThat(alDia.estadoEfectivo()).isEqualTo("ACTIVA");
        assertThat(alDia.puedeCobrar()).isTrue();

        // Vencido 5 días (dentro de gracia) -> AVISO, aún cobra.
        ponerPagoHasta(neg, hoy.minusDays(5));
        var aviso = suscripcionService.situacion(neg);
        assertThat(aviso.estadoEfectivo()).isEqualTo("AVISO");
        assertThat(aviso.puedeCobrar()).isTrue();

        // Vencido 20 días (pasado el corte de 15) -> SUSPENDIDA efectiva, solo consulta.
        ponerPagoHasta(neg, hoy.minusDays(20));
        var corte = suscripcionService.situacion(neg);
        assertThat(corte.estadoEfectivo()).isEqualTo("SUSPENDIDA");
        assertThat(corte.puedeCobrar()).isFalse();
        assertThat(corte.soloConsulta()).isTrue();
    }

    @Test
    void permisoSoloSeEmiteSiElNegocioEstaAlDia() {
        Long neg = nuevoNegocio("Cocoa", "permiso@ejemplo.com");
        Long cajaId;
        try {
            NegocioContext.set(neg);
            cajaId = cajaService.registrar("Caja 1", null).caja().getId();
        } finally {
            NegocioContext.clear();
        }

        // Al día -> se emite permiso.
        ponerPagoHasta(neg, com.kioskpos.web.Fechas.hoy().plusDays(10));
        var permiso = permisoService.renovar(neg, cajaId);
        assertThat(permiso.permiso()).isNotBlank();
        permisoService.exigirPermisoVigente(permiso.permiso(), neg, cajaId); // no lanza

        // Un permiso de esta caja no sirve para otra caja/negocio.
        assertThatThrownBy(() -> permisoService.exigirPermisoVigente(permiso.permiso(), neg, cajaId + 999))
                .isInstanceOf(PermisoDenegadoException.class);

        // Vencido más allá de la gracia -> se niega la renovación.
        ponerPagoHasta(neg, com.kioskpos.web.Fechas.hoy().minusDays(30));
        assertThatThrownBy(() -> permisoService.renovar(neg, cajaId))
                .isInstanceOf(PermisoDenegadoException.class);

        // Suspensión manual -> también se niega, aunque estuviera al día.
        ponerPagoHasta(neg, com.kioskpos.web.Fechas.hoy().plusDays(10));
        suscripcionService.suspender(neg);
        assertThatThrownBy(() -> permisoService.renovar(neg, cajaId))
                .isInstanceOf(PermisoDenegadoException.class);
    }

    @Test
    void aprobarPagoEmpujaPagoHastaYReactivaElCobro() {
        Long neg = nuevoNegocio("Cocoa", "pago@ejemplo.com");
        ponerPagoHasta(neg, com.kioskpos.web.Fechas.hoy().minusDays(40)); // bien vencido, solo consulta
        assertThat(suscripcionService.puedeCobrar(neg)).isFalse();

        var pago = suscripcionService.reportarPago(neg, new BigDecimal("25.00"), "USD", "Pago móvil", "REF-1", 1);
        assertThat(pago.getEstado()).isEqualTo("PENDIENTE");

        suscripcionService.aprobarPago(pago.getId(), 1L);
        var sit = suscripcionService.situacion(neg);
        assertThat(sit.puedeCobrar()).isTrue();
        assertThat(sit.pagoHasta()).isAfterOrEqualTo(com.kioskpos.web.Fechas.hoy());
    }

    @Test
    void laPruebaGratisVenceSolaSinDiasDeGracia() {
        Long neg = nuevoNegocio("Prueba", "prueba@ejemplo.com");
        var inicio = suscripcionService.situacion(neg);
        assertThat(inicio.enPrueba()).isTrue();
        assertThat(inicio.puedeCobrar()).isTrue();
        assertThat(inicio.mensaje()).contains("Prueba gratis: te quedan");

        // Venció ayer: suspendido de una vez (quien ya pagó tendría 15 días de aviso).
        Negocio n = negocioRepository.findById(neg).orElseThrow();
        n.setPagoHasta(com.kioskpos.web.Fechas.hoy().minusDays(1));
        negocioRepository.save(n);
        var vencida = suscripcionService.situacion(neg);
        assertThat(vencida.estadoEfectivo()).isEqualTo("SUSPENDIDA");
        assertThat(vencida.puedeCobrar()).isFalse();
        assertThat(vencida.mensaje()).contains("prueba gratis terminó");
        assertThat(vencida.deuda()).isEqualByComparingTo("25.00");

        // Paga el primer mes: deja de estar en prueba y vuelve a cobrar.
        var pago = suscripcionService.reportarPago(neg, new BigDecimal("25.00"), "USD", "Pago móvil", "R-9", 1);
        suscripcionService.aprobarPago(pago.getId(), 1L);
        var cliente = suscripcionService.situacion(neg);
        assertThat(cliente.enPrueba()).isFalse();
        assertThat(cliente.puedeCobrar()).isTrue();
    }

    @Test
    void planYCajasDefinenLaMensualidadYLosLimites() {
        Long neg = nuevoNegocio("Planes", "planes@ejemplo.com");
        assertThat(suscripcionService.situacion(neg).mensualidad()).isEqualByComparingTo("25.00");
        suscripcionService.cambiarPlan(neg, "basico", 2, 1);
        assertThat(suscripcionService.situacion(neg).mensualidad()).isEqualByComparingTo("35.00"); // 25 + 1 caja extra de 10
        suscripcionService.cambiarPlan(neg, "PRO", 3, 1);
        var pro = suscripcionService.situacion(neg);
        assertThat(pro.plan()).isEqualTo("PRO");
        assertThat(pro.cajasContratadas()).isEqualTo(3);
        assertThat(pro.mensualidad()).isEqualByComparingTo("48.00"); // 40 + 1 extra de 8

        assertThatThrownBy(() -> suscripcionService.cambiarPlan(neg, "BASICO", 4, 1)).hasMessageContaining("hasta 3 cajas");
        assertThatThrownBy(() -> suscripcionService.cambiarPlan(neg, "PRO", 1, 2)).hasMessageContaining("Desactiva alguna");
        assertThatThrownBy(() -> suscripcionService.cambiarPlan(neg, "ORO", 1, 0)).hasMessageContaining("Plan inválido");
    }
}
