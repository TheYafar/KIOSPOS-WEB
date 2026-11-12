package com.kioskpos.web.venta;

import com.kioskpos.web.negocio.Negocio;
import com.kioskpos.web.negocio.NegocioRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ticket térmico de 40 columnas, texto plano (CLAUDE.md §9). Lo imprime el Conector
 * KioskPOS en Windows; el servidor solo arma el texto. Formato portado del ticket del
 * escritorio, ampliado de 36 a 40 columnas.
 */
@Service
public class TicketService {

    private static final int ANCHO = 40;
    private static final ZoneId ZONA = ZoneId.of("America/Caracas");
    private static final DateTimeFormatter FECHA =
            DateTimeFormatter.ofPattern("dd/MM/yyyy hh:mm a", Locale.US).withZone(ZONA);

    private final NegocioRepository negocioRepository;

    public TicketService(NegocioRepository negocioRepository) {
        this.negocioRepository = negocioRepository;
    }

    /**
     * Formato de Bodegas Cocoa:
     * <pre>
     * ========================================
     *              BODEGAS COCOA
     *           DIOS TODO PODEROSO
     * ========================================
     * FECHA : 08/10/2026 09:15 a. m.
     * FACTURA #: 000001
     * ----------------------------------------
     * CLIENTE: Consumidor Final
     * ----------------------------------------
     * CANT  DESCRIPCION           PRECIO (Bs)
     * ----------------------------------------
     * 2 x COPIAS
     *   (2 x Bs. 157,50)           Bs. 315,00
     * ----------------------------------------
     * TOTAL EN BOLIVARES           Bs. 315,00
     * ========================================
     *              FORMA DE PAGO
     * ----------------------------------------
     * PUNTO                        VES 315,00
     * ========================================
     * </pre>
     */
    @Transactional(readOnly = true)
    public String generar(Venta venta) {
        Negocio negocio = negocioRepository.findById(venta.getNegocioId()).orElse(null);
        String nombreNegocio = negocio != null ? negocio.getNombre() : "KIOSKPOS";
        String cliente = null;
        for (PagoVenta p : venta.getPagos()) {
            if (p.getMetodo() == MetodoPago.FIADO && p.getReferencia() != null && !p.getReferencia().isBlank()) {
                cliente = p.getReferencia().trim();
            }
        }
        return armar(negocio, nombreNegocio, venta, cliente);
    }

    static String armar(Negocio negocio, String nombreNegocio, Venta venta, String cliente) {
        String doble = "=".repeat(ANCHO) + "\n";
        String linea = "-".repeat(ANCHO) + "\n";
        StringBuilder sb = new StringBuilder();

        sb.append(doble);
        sb.append(encabezado(negocio, nombreNegocio));
        sb.append(doble);
        sb.append("FECHA : ").append(fechaVE(venta.getFechaHora())).append("\n");
        if (venta.getNumeroFactura() != null) {
            sb.append("FACTURA #: ").append(String.format("%06d", venta.getNumeroFactura())).append("\n");
        }
        sb.append(linea);
        sb.append(recortar("CLIENTE: " + (cliente == null ? "Consumidor Final" : cliente))).append("\n");
        sb.append(linea);
        sb.append(fila("CANT  DESCRIPCION", "PRECIO (Bs)"));
        sb.append(linea);

        BigDecimal tasa = venta.getTasaBcv();
        for (DetalleVenta d : venta.getDetalles()) {
            String cant = numCant(d.getCantidad());
            for (String r : envolver(cant + " x " + d.getNombre().toUpperCase(Locale.ROOT))) {
                sb.append(r).append("\n");
            }
            BigDecimal unitBs = d.getPrecioUnitarioUsd().multiply(tasa).setScale(2, RoundingMode.HALF_UP);
            BigDecimal lineaBs = d.getSubtotalUsd().multiply(tasa).setScale(2, RoundingMode.HALF_UP);
            sb.append(fila("  (" + cant + " x " + bsVE(unitBs) + ")", bsVE(lineaBs)));
        }
        sb.append(linea);
        sb.append(fila("TOTAL EN BOLIVARES", bsVE(venta.getTotalBs())));
        sb.append(doble);

        boolean hayPagos = venta.getPagos().stream().anyMatch(p -> p.getMontoOriginal().signum() > 0);
        if (hayPagos) {
            sb.append(centrar("FORMA DE PAGO")).append("\n");
            sb.append(linea);
            for (PagoVenta p : venta.getPagos()) {
                if (p.getMontoOriginal().signum() <= 0) {
                    continue;
                }
                String simbolo = p.getMoneda() == Moneda.USD ? "USD " : "VES ";
                String nombre = p.getMetodo() == MetodoPago.OTRO && p.getReferencia() != null && !p.getReferencia().isBlank()
                        ? p.getReferencia().trim().toUpperCase(Locale.ROOT)
                        : p.getMetodo() == MetodoPago.FIADO ? "CREDITO" : p.getMetodo().name();
                sb.append(fila(nombre, simbolo + numVE(p.getMontoOriginal())));
                if (p.getMetodo() == MetodoPago.PAGO_MOVIL && p.getReferencia() != null
                        && !p.getReferencia().isBlank()) {
                    sb.append(fila("  Ref:", p.getReferencia().trim()));
                }
            }
            if (venta.getVueltoBs().signum() > 0) {
                sb.append(fila("VUELTO", "VES " + numVE(venta.getVueltoBs())));
            }
            if (venta.getVueltoUsd().signum() > 0) {
                sb.append(fila("VUELTO", "USD " + numVE(venta.getVueltoUsd())));
            }
            sb.append(doble);
        }
        return sb.toString();
    }

    /** "08/10/2026 09:15 a. m." (como lo imprime el escritorio en español). */
    static String fechaVE(java.time.Instant i) {
        String f = FECHA.format(i);
        return f.endsWith("AM") ? f.substring(0, f.length() - 2) + "a. m." : f.substring(0, f.length() - 2) + "p. m.";
    }

    private static String numCant(BigDecimal c) {
        return c.stripTrailingZeros().toPlainString().replace('.', ',');
    }

    private static String recortar(String t) {
        return t.length() > ANCHO ? t.substring(0, ANCHO) : t;
    }

    /** Nombre del negocio y su frase (en mayúsculas), RIF, dirección y teléfono, centrados. */
    static String encabezado(Negocio negocio, String nombreNegocio) {
        StringBuilder sb = new StringBuilder();
        for (String r : envolver(nombreNegocio.replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT))) {
            sb.append(centrar(r)).append("\n");
        }
        if (negocio == null) {
            return sb.toString();
        }
        // Frase bajo el nombre (Ej.: "DIOS TODO PODEROSO"), como en el ticket de Cocoa.
        if (negocio.getMensajeTicket() != null && !negocio.getMensajeTicket().isBlank()) {
            for (String r : envolver(negocio.getMensajeTicket().replaceAll("\\s+", " ").trim().toUpperCase(Locale.ROOT))) {
                sb.append(centrar(r)).append("\n");
            }
        }
        if (negocio.getRif() != null && !negocio.getRif().isBlank()) {
            sb.append(centrar("RIF: " + negocio.getRif().trim())).append("\n");
        }
        if (negocio.getDireccion() != null && !negocio.getDireccion().isBlank()) {
            for (String r : envolver(negocio.getDireccion().replaceAll("\\s+", " ").trim())) {
                sb.append(centrar(r)).append("\n");
            }
        }
        if (negocio.getTelefono() != null && !negocio.getTelefono().isBlank()) {
            sb.append(centrar("Tel: " + negocio.getTelefono().trim())).append("\n");
        }
        return sb.toString();
    }

    private static String numVE(BigDecimal v) {
        DecimalFormatSymbols s = new DecimalFormatSymbols(Locale.US);
        s.setDecimalSeparator(',');
        s.setGroupingSeparator('.');
        return new DecimalFormat("#,##0.00", s).format(v == null ? BigDecimal.ZERO : v);
    }

    private static String bsVE(BigDecimal v) {
        return "Bs. " + numVE(v);
    }

    /** Izquierda recortada + derecha pegada al borde, en una línea de ANCHO columnas. */
    private static String fila(String izquierda, String derecha) {
        int max = Math.max(1, ANCHO - 1 - derecha.length());
        String izq = izquierda.length() > max ? izquierda.substring(0, max) : izquierda;
        return izq + " ".repeat(Math.max(1, ANCHO - izq.length() - derecha.length())) + derecha + "\n";
    }

    private static String centrar(String texto) {
        if (texto.length() >= ANCHO) {
            return texto.substring(0, ANCHO);
        }
        return " ".repeat((ANCHO - texto.length()) / 2) + texto;
    }

    private static List<String> envolver(String texto) {
        List<String> lineas = new ArrayList<>();
        StringBuilder actual = new StringBuilder();
        for (String palabra : texto.split(" ")) {
            if (actual.length() > 0 && actual.length() + 1 + palabra.length() > ANCHO) {
                lineas.add(actual.toString());
                actual.setLength(0);
            }
            while (palabra.length() > ANCHO) {
                lineas.add(palabra.substring(0, ANCHO));
                palabra = palabra.substring(ANCHO);
            }
            if (actual.length() > 0) {
                actual.append(' ');
            }
            actual.append(palabra);
        }
        if (actual.length() > 0 || lineas.isEmpty()) {
            lineas.add(actual.toString());
        }
        return lineas;
    }
}
