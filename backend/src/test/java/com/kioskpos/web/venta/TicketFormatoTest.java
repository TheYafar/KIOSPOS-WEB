package com.kioskpos.web.venta;

import static org.assertj.core.api.Assertions.assertThat;

import com.kioskpos.web.negocio.Negocio;
import java.math.BigDecimal;
import java.time.ZonedDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

/** El ticket sale con el formato de Bodegas Cocoa (40 columnas, texto plano). */
class TicketFormatoTest {

    @Test
    void formatoCocoa() {
        Negocio n = new Negocio();
        n.setNombre("Bodegas Cocoa");
        n.setMensajeTicket("Dios todo poderoso");
        Venta v = new Venta();
        v.setNumeroFactura(12);
        v.setFechaHora(ZonedDateTime.of(2026, 10, 8, 9, 15, 0, 0, ZoneId.of("America/Caracas")).toInstant());
        v.setTasaBcv(new BigDecimal("157.50"));
        v.setTotalUsd(new BigDecimal("2.00"));
        v.setTotalBs(new BigDecimal("315.00"));
        DetalleVenta d = new DetalleVenta();
        d.setNombre("Copias");
        d.setCantidad(new BigDecimal("2"));
        d.setPrecioUnitarioUsd(new BigDecimal("1.00"));
        d.setSubtotalUsd(new BigDecimal("2.00"));
        v.addDetalle(d);
        PagoVenta p = new PagoVenta();
        p.setMetodo(MetodoPago.PUNTO);
        p.setMoneda(Moneda.VES);
        p.setMontoOriginal(new BigDecimal("315.00"));
        v.addPago(p);

        String t = TicketService.armar(n, n.getNombre(), v, null);
        String esperado = String.join("\n",
                "========================================",
                "             BODEGAS COCOA",
                "           DIOS TODO PODEROSO",
                "========================================",
                "          DOCUMENTO NO FISCAL",
                "FECHA : 08/10/2026 09:15:00 a. m.",
                "NRO. CONTROL INTERNO: 000012",
                "----------------------------------------",
                "CLIENTE: Consumidor Final",
                "----------------------------------------",
                "CANT  DESCRIPCION            PRECIO (Bs)",
                "----------------------------------------",
                "2 x COPIAS",
                "  (2 x Bs. 157,50)            Bs. 315,00",
                "----------------------------------------",
                "TOTAL EN BOLIVARES            Bs. 315,00",
                "========================================",
                "             FORMA DE PAGO",
                "----------------------------------------",
                "PUNTO                         VES 315,00",
                "========================================",
                "    ESTE DOCUMENTO NO ES UNA FACTURA",
                "      SIN DERECHO A CREDITO FISCAL",
                "    SI REQUIERE FACTURA, SOLICITELA",
                "");
        assertThat(t).isEqualTo(esperado);
        String conDoc = TicketService.armar(n, n.getNombre(), v, "Pedro Perez", "V-12345678");
        assertThat(conDoc).contains("CLIENTE: Pedro Perez\nC.I./RIF: V-12345678\n").doesNotContain("FACTURA #");
        for (String linea : t.split("\n")) {
            assertThat(linea.length()).isLessThanOrEqualTo(40);
        }
    }
}
