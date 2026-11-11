package com.kioskpos.conector;

import com.sun.net.httpserver.HttpServer;
import java.awt.AWTException;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.GraphicsEnvironment;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.RenderingHints;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.awt.image.BufferedImage;

/**
 * Icono en la bandeja de Windows (junto al reloj): muestra que el Conector está abierto
 * y permite probar la impresora, abrir la gaveta o cerrarlo. Si el equipo no tiene
 * bandeja (servidor sin pantalla), no hace nada y el Conector sigue funcionando.
 */
final class Bandeja {

    private Bandeja() {
    }

    static void mostrar(int puerto, HttpServer server) {
        if (GraphicsEnvironment.isHeadless() || !SystemTray.isSupported()) {
            return;
        }
        try {
            PopupMenu menu = new PopupMenu();
            MenuItem titulo = new MenuItem("KioskPOS Conector — puerto " + puerto);
            titulo.setEnabled(false);
            MenuItem probar = new MenuItem("Imprimir ticket de prueba");
            MenuItem gaveta = new MenuItem("Abrir gaveta");
            MenuItem salir = new MenuItem("Cerrar el Conector");
            menu.add(titulo);
            menu.addSeparator();
            menu.add(probar);
            menu.add(gaveta);
            menu.addSeparator();
            menu.add(salir);

            TrayIcon icono = new TrayIcon(dibujarIcono(), "KioskPOS Conector: listo para imprimir", menu);
            icono.setImageAutoSize(true);
            probar.addActionListener(e -> {
                try {
                    String usada = Impresora.imprimir(ticketDePrueba(), false, null);
                    icono.displayMessage("KioskPOS", "Ticket de prueba enviado a " + usada, TrayIcon.MessageType.INFO);
                } catch (Exception ex) {
                    icono.displayMessage("KioskPOS", "No se pudo imprimir: " + ex.getMessage(), TrayIcon.MessageType.ERROR);
                }
            });
            gaveta.addActionListener(e -> {
                try {
                    Impresora.abrirGaveta(null);
                } catch (Exception ex) {
                    icono.displayMessage("KioskPOS", "No se pudo abrir la gaveta: " + ex.getMessage(), TrayIcon.MessageType.ERROR);
                }
            });
            salir.addActionListener(e -> {
                server.stop(0);
                SystemTray.getSystemTray().remove(icono);
                System.exit(0);
            });
            SystemTray.getSystemTray().add(icono);
        } catch (AWTException | RuntimeException e) {
            System.out.println("Sin icono en la bandeja: " + e.getMessage());
        }
    }

    static String ticketDePrueba() {
        String linea = "-".repeat(40);
        return String.join("\n",
                "           KIOSKPOS CONECTOR",
                linea,
                "Ticket de prueba",
                "Si lees esto, la impresora funciona.",
                "1234567890123456789012345678901234567890",
                linea, "", "");
    }

    /** Un cuadrado verde con una "K": sin archivos de imagen aparte. */
    private static BufferedImage dibujarIcono() {
        BufferedImage img = new BufferedImage(32, 32, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setColor(new Color(0x0f, 0x76, 0x6e));
        g.fillRoundRect(0, 0, 32, 32, 9, 9);
        g.setColor(Color.WHITE);
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 22));
        g.drawString("K", 8, 24);
        g.dispose();
        return img;
    }
}
