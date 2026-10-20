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

    @Transactional(readOnly = true)
    public String generar(Venta venta) {
        String nombreNegocio = negocioRepository.findById(venta.getNegocioId())
                .map(Negocio::getNombre)
                .orElse("KIOSKPOS");

        String linea = "-".repeat(ANCHO) + "\n";
        StringBuilder sb = new StringBuilder();

        for (String r : envolver(nombreNegocio.replaceAll("\\s+", " "))) {
            sb.append(centrar(r)).append("\n");
        }
        sb.append(linea);

        sb.append("TICKET # ").append(String.format("%06d", venta.getNumeroFactura())).append("\n");
        sb.append("FECHA: ").append(FECHA.format(venta.getFechaHora())).append("\n");
        sb.append(linea);

        sb.append(fila("CANT  DESCRIPCION", "TOTAL (Bs)"));
        BigDecimal tasa = venta.getTasaBcv();
        for (DetalleVenta d : venta.getDetalles()) {
            String cant = d.getCantidad().stripTrailingZeros().toPlainString();
            BigDecimal lineaBs = d.getSubtotalUsd().multiply(tasa).setScale(2, RoundingMode.HALF_UP);
            for (String r : envolver(cant + " x " + d.getNombre())) {
                sb.append(r).append("\n");
            }
            sb.append(fila("", bsVE(lineaBs)));
        }
        sb.append(linea);

        sb.append(fila("TOTAL EN BOLIVARES", bsVE(venta.getTotalBs())));
        sb.append(fila("TOTAL EN DOLARES", "$ " + numVE(venta.getTotalUsd())));
        sb.append(linea);

        boolean hayPagos = venta.getPagos().stream().anyMatch(p -> p.getMontoOriginal().signum() > 0);
        if (hayPagos) {
            sb.append(centrar("FORMA DE PAGO")).append("\n");
            for (PagoVenta p : venta.getPagos()) {
                if (p.getMontoOriginal().signum() <= 0) {
                    continue;
                }
                String simbolo = p.getMoneda() == Moneda.USD ? "USD " : "VES ";
                sb.append(fila(p.getMetodo().name(), simbolo + numVE(p.getMontoOriginal())));
                if (p.getMetodo() == MetodoPago.PAGO_MOVIL && p.getReferencia() != null
                        && !p.getReferencia().isBlank()) {
                    sb.append(fila("  Ref:", p.getReferencia().trim()));
                }
            }
            sb.append(linea);
        }

        if (venta.getVueltoBs().signum() > 0 || venta.getVueltoUsd().signum() > 0) {
            if (venta.getVueltoBs().signum() > 0) {
                sb.append(fila("VUELTO", bsVE(venta.getVueltoBs())));
            }
            if (venta.getVueltoUsd().signum() > 0) {
                sb.append(fila("VUELTO", "$ " + numVE(venta.getVueltoUsd())));
            }
            sb.append(linea);
        }

        for (String r : envolver("Gracias por su compra. Vuelva pronto.")) {
            sb.append(centrar(r)).append("\n");
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
