package com.kioskpos.conector;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import javax.print.DocFlavor;
import javax.print.DocPrintJob;
import javax.print.PrintService;
import javax.print.PrintServiceLookup;
import javax.print.SimpleDoc;
import javax.print.attribute.HashPrintRequestAttributeSet;
import javax.print.attribute.PrintRequestAttributeSet;
import javax.print.attribute.standard.Copies;
import javax.print.attribute.standard.JobName;

/**
 * Impresión térmica ESC/POS y apertura de gaveta, portada de ImpresionService del
 * escritorio. Envía bytes crudos al spooler de Windows: el navegador no puede hacerlo,
 * por eso existe este Conector local.
 */
final class Impresora {

    // Comandos ESC/POS estándar (Epson, Xprinter, Bixolon, Star...).
    private static final byte[] ESC_INIT = {0x1B, 0x40};               // ESC @ inicializar
    private static final byte[] ESC_CP437 = {0x1B, 0x74, 0x00};        // ESC t 0
    private static final byte[] ESC_NEGRITA = {0x1B, 0x45, 0x01};      // ESC E 1
    private static final byte[] ESC_FEED_CUT = {0x1B, 0x64, 0x04, 0x1D, 0x56, 0x42, 0x00}; // feed 4 + corte
    private static final byte[] ESC_ABRIR_GAVETA = {0x1B, 0x70, 0x00, 0x19, (byte) 0xFA};  // ESC p 0 25 250

    private Impresora() {
    }

    static List<String> listar() {
        List<String> nombres = new ArrayList<>();
        for (PrintService ps : PrintServiceLookup.lookupPrintServices(null, null)) {
            if (ps != null && ps.getName() != null && !ps.getName().isBlank()) {
                nombres.add(ps.getName());
            }
        }
        return nombres;
    }

    static String impresoraPorDefecto() {
        PrintService ps = PrintServiceLookup.lookupDefaultPrintService();
        return ps != null ? ps.getName() : null;
    }

    /**
     * Imprime el ticket (texto 40 columnas) y, si se pide, abre la gaveta. Devuelve el
     * nombre de la impresora usada. Lanza si no hay impresora o falla el envío.
     */
    static String imprimir(String ticket, boolean abrirGaveta, String impresoraNombre) throws Exception {
        PrintService destino = buscar(impresoraNombre);
        if (destino == null) {
            throw new IllegalStateException("No hay ninguna impresora disponible en Windows");
        }

        String texto = (ticket == null ? "" : ticket).replace("\r\n", "\n").replace("\n", "\r\n");
        ByteArrayOutputStream datos = new ByteArrayOutputStream();
        datos.write(ESC_INIT);
        datos.write(ESC_CP437);
        datos.write(ESC_NEGRITA);
        datos.write(texto.getBytes(StandardCharsets.ISO_8859_1));
        datos.write(ESC_FEED_CUT);
        if (abrirGaveta) {
            datos.write(ESC_ABRIR_GAVETA);
        }

        DocFlavor flavor = DocFlavor.BYTE_ARRAY.AUTOSENSE;
        if (!destino.isDocFlavorSupported(flavor)) {
            throw new IllegalStateException(
                    "La impresora '" + destino.getName() + "' no admite datos crudos ESC/POS");
        }
        DocPrintJob job = destino.createPrintJob();
        PrintRequestAttributeSet attrs = new HashPrintRequestAttributeSet();
        attrs.add(new JobName("KioskPOS-Ticket-" + System.currentTimeMillis(), null));
        attrs.add(new Copies(1));
        job.print(new SimpleDoc(datos.toByteArray(), flavor, null), attrs);
        return destino.getName();
    }

    /** Abre la gaveta sin imprimir (p. ej. para sacar cambio). */
    static String abrirGaveta(String impresoraNombre) throws Exception {
        PrintService destino = buscar(impresoraNombre);
        if (destino == null) {
            throw new IllegalStateException("No hay ninguna impresora disponible en Windows");
        }
        DocFlavor flavor = DocFlavor.BYTE_ARRAY.AUTOSENSE;
        DocPrintJob job = destino.createPrintJob();
        job.print(new SimpleDoc(ESC_ABRIR_GAVETA, flavor, null), new HashPrintRequestAttributeSet());
        return destino.getName();
    }

    private static PrintService buscar(String nombre) {
        if (nombre == null || nombre.isBlank()) {
            PrintService def = PrintServiceLookup.lookupDefaultPrintService();
            if (def != null) {
                return def;
            }
            PrintService[] todas = PrintServiceLookup.lookupPrintServices(null, null);
            return (todas != null && todas.length > 0) ? todas[0] : null;
        }
        PrintService[] todas = PrintServiceLookup.lookupPrintServices(null, null);
        if (todas == null) {
            return null;
        }
        for (PrintService ps : todas) {
            if (ps.getName().equalsIgnoreCase(nombre.trim())) {
                return ps;
            }
        }
        for (PrintService ps : todas) {
            if (ps.getName().toLowerCase().contains(nombre.toLowerCase().trim())) {
                return ps;
            }
        }
        return null;
    }
}
