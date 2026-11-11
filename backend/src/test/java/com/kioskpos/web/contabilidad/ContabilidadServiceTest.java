package com.kioskpos.web.contabilidad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kioskpos.web.PostgresRlsTestBase;
import com.kioskpos.web.auth.NegocioRegistroService;
import com.kioskpos.web.tenant.NegocioContext;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** La libreta/hojas de Cuentas se guardan en el servidor, con versión y aisladas por negocio. */
@SpringBootTest
class ContabilidadServiceTest extends PostgresRlsTestBase {

    @Autowired private NegocioRegistroService negocioRegistroService;
    @Autowired private ContabilidadService service;

    @AfterEach
    void limpiar() {
        NegocioContext.clear();
    }

    private static <T> T en(Long negocioId, Supplier<T> f) {
        try {
            NegocioContext.set(negocioId);
            return f.get();
        } finally {
            NegocioContext.clear();
        }
    }

    @Test
    void guardaConVersionYDetectaQueOtroEquipoGuardoAntes() {
        Long neg = negocioRegistroService.registrarNegocioConDueno("C1", "D", "cont1@ejemplo.com", "clave-secreta").negocioId();
        assertThat(en(neg, () -> service.leer("hojas"))).isEmpty();

        var v1 = en(neg, () -> service.guardar("hojas", "[{\"id\":\"a\"}]", 0));
        assertThat(v1.version()).isEqualTo(1);
        var v2 = en(neg, () -> service.guardar("hojas", "[{\"id\":\"b\"}]", 1));
        assertThat(v2.version()).isEqualTo(2);

        // Un equipo que todavía tenía la versión 1 no pisa lo nuevo: recibe lo del servidor.
        assertThatThrownBy(() -> en(neg, () -> service.guardar("hojas", "[{\"id\":\"viejo\"}]", 1)))
                .isInstanceOfSatisfying(ContabilidadService.Conflicto.class,
                        c -> assertThat(c.actual().contenido()).contains("\"b\""));
        assertThat(en(neg, () -> service.leer("hojas")).orElseThrow().contenido()).contains("\"b\"");

        assertThatThrownBy(() -> en(neg, () -> service.guardar("otra", "x", 0))).hasMessageContaining("inválido");
    }

    @Test
    void otroNegocioNoVeLaContabilidad() {
        Long a = negocioRegistroService.registrarNegocioConDueno("CA", "D", "cont2@ejemplo.com", "clave-secreta").negocioId();
        Long b = negocioRegistroService.registrarNegocioConDueno("CB", "D", "cont3@ejemplo.com", "clave-secreta").negocioId();
        en(a, () -> service.guardar("libro", "[1,2,3]", 0));
        assertThat(en(b, () -> service.leer("libro"))).isEmpty();
        // B puede tener la suya propia sin chocar con la de A.
        assertThat(en(b, () -> service.guardar("libro", "[9]", 0)).version()).isEqualTo(1);
        assertThat(en(a, () -> service.leer("libro")).orElseThrow().contenido()).isEqualTo("[1,2,3]");
    }
}
