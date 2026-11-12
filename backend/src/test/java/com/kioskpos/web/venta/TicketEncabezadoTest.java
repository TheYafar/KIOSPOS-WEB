package com.kioskpos.web.venta;

import static org.assertj.core.api.Assertions.assertThat;

import com.kioskpos.web.negocio.Negocio;
import org.junit.jupiter.api.Test;

class TicketEncabezadoTest {

    @Test
    void encabezadoTraeNombreRifDireccionYTelefonoEn40Columnas() {
        Negocio n = new Negocio();
        n.setNombre("Bodega Cocoa");
        n.setRif("J-12345678-9");
        n.setDireccion("Av. Principal de La Candelaria, local 4, frente a la plaza");
        n.setTelefono("0412-1234567");
        String enc = TicketService.encabezado(n, n.getNombre());
        assertThat(enc).contains("BODEGA COCOA").contains("RIF: J-12345678-9").contains("Tel: 0412-1234567").contains("La Candelaria");
        for (String linea : enc.split("\n")) {
            assertThat(linea.length()).isLessThanOrEqualTo(40);
        }
    }

    @Test
    void sinDatosSoloElNombre() {
        Negocio n = new Negocio();
        n.setNombre("Mi bodega");
        assertThat(TicketService.encabezado(n, n.getNombre()).trim()).isEqualTo("MI BODEGA");
        n.setMensajeTicket("Dios todo poderoso");
        assertThat(TicketService.encabezado(n, n.getNombre())).contains("DIOS TODO PODEROSO");
    }
}
