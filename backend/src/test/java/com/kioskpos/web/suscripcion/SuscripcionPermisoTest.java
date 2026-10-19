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
        negocioRepository.save(n);
    }

    @Test
    void escaleraDeCorteSegunDiasVencido() {
        Long neg = nuevoNegocio("Cocoa", "esc@ejemplo.com");
        LocalDate hoy = LocalDate.now();

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
        ponerPagoHasta(neg, LocalDate.now().plusDays(10));
        var permiso = permisoService.renovar(neg, cajaId);
        assertThat(permiso.permiso()).isNotBlank();
        permisoService.exigirPermisoVigente(permiso.permiso(), neg, cajaId); // no lanza

        // Un permiso de esta caja no sirve para otra caja/negocio.
        assertThatThrownBy(() -> permisoService.exigirPermisoVigente(permiso.permiso(), neg, cajaId + 999))
                .isInstanceOf(PermisoDenegadoException.class);

        // Vencido más allá de la gracia -> se niega la renovación.
        ponerPagoHasta(neg, LocalDate.now().minusDays(30));
        assertThatThrownBy(() -> permisoService.renovar(neg, cajaId))
                .isInstanceOf(PermisoDenegadoException.class);

        // Suspensión manual -> también se niega, aunque estuviera al día.
        ponerPagoHasta(neg, LocalDate.now().plusDays(10));
        suscripcionService.suspender(neg);
        assertThatThrownBy(() -> permisoService.renovar(neg, cajaId))
                .isInstanceOf(PermisoDenegadoException.class);
    }

    @Test
    void aprobarPagoEmpujaPagoHastaYReactivaElCobro() {
        Long neg = nuevoNegocio("Cocoa", "pago@ejemplo.com");
        ponerPagoHasta(neg, LocalDate.now().minusDays(40)); // bien vencido, solo consulta
        assertThat(suscripcionService.puedeCobrar(neg)).isFalse();

        var pago = suscripcionService.reportarPago(neg, new BigDecimal("25.00"), "USD", "Pago móvil", "REF-1", 1);
        assertThat(pago.getEstado()).isEqualTo("PENDIENTE");

        suscripcionService.aprobarPago(pago.getId(), 1L);
        var sit = suscripcionService.situacion(neg);
        assertThat(sit.puedeCobrar()).isTrue();
        assertThat(sit.pagoHasta()).isAfterOrEqualTo(LocalDate.now());
    }
}
