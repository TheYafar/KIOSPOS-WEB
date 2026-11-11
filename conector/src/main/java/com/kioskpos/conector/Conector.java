package com.kioskpos.conector;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

/**
 * Conector KioskPOS: programa Java pequeño que corre en la PC de la caja, junto al
 * navegador. Expone un servidor HTTP SOLO en localhost que la PWA llama para imprimir
 * el ticket de 40 columnas (texto plano) y abrir la gaveta, porque el navegador no
 * puede mandar bytes crudos a la impresora térmica.
 *
 * Sin dependencias externas (solo el JDK). Endpoints:
 *   GET  /estado        -> ok + impresora por defecto + lista de impresoras
 *   POST /imprimir       -> cuerpo = texto del ticket; header X-Abrir-Gaveta: true|false
 *                           header opcional X-Impresora: nombre
 *   POST /abrir-gaveta   -> abre la gaveta sin imprimir
 *
 * Escucha solo en 127.0.0.1 (no accesible desde la red) y responde CORS para que la
 * PWA, servida desde otro origen, pueda llamarlo.
 */
public final class Conector {

    private static final int PUERTO = 9010;

    public static void main(String[] args) throws IOException {
        int puerto = args.length > 0 ? parsePuerto(args[0]) : PUERTO;
        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), puerto), 0);
        } catch (java.net.BindException e) {
            // Ya hay un Conector abierto (una sola instancia): salir sin error.
            System.out.println("El Conector KioskPOS ya está abierto en el puerto " + puerto + ".");
            return;
        }
        server.createContext("/estado", Conector::estado);
        server.createContext("/imprimir", Conector::imprimir);
        server.createContext("/abrir-gaveta", Conector::abrirGaveta);
        server.setExecutor(null);
        server.start();
        System.out.println("Conector KioskPOS escuchando en http://127.0.0.1:" + puerto);
        System.out.println("Impresora por defecto: " + Impresora.impresoraPorDefecto());
        Bandeja.mostrar(puerto, server);
    }

    private static void estado(HttpExchange ex) throws IOException {
        if (cors(ex)) {
            return;
        }
        StringBuilder sb = new StringBuilder();
        sb.append("ok\n");
        sb.append("defecto: ").append(Impresora.impresoraPorDefecto()).append('\n');
        sb.append("impresoras:\n");
        for (String n : Impresora.listar()) {
            sb.append("  - ").append(n).append('\n');
        }
        responder(ex, 200, sb.toString());
    }

    private static void imprimir(HttpExchange ex) throws IOException {
        if (cors(ex)) {
            return;
        }
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            responder(ex, 405, "Use POST");
            return;
        }
        String ticket = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        boolean abrir = "true".equalsIgnoreCase(cabecera(ex, "X-Abrir-Gaveta"));
        String impresora = cabecera(ex, "X-Impresora");
        try {
            String usada = Impresora.imprimir(ticket, abrir, impresora);
            responder(ex, 200, "impreso en: " + usada);
        } catch (Exception e) {
            responder(ex, 500, "error: " + e.getMessage());
        }
    }

    private static void abrirGaveta(HttpExchange ex) throws IOException {
        if (cors(ex)) {
            return;
        }
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            responder(ex, 405, "Use POST");
            return;
        }
        try {
            String usada = Impresora.abrirGaveta(cabecera(ex, "X-Impresora"));
            responder(ex, 200, "gaveta abierta via: " + usada);
        } catch (Exception e) {
            responder(ex, 500, "error: " + e.getMessage());
        }
    }

    /** Responde el preflight OPTIONS y agrega cabeceras CORS. Devuelve true si ya respondió. */
    private static boolean cors(HttpExchange ex) throws IOException {
        ex.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        ex.getResponseHeaders().add("Access-Control-Allow-Headers", "Content-Type, X-Abrir-Gaveta, X-Impresora");
        ex.getResponseHeaders().add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            ex.close();
            return true;
        }
        return false;
    }

    private static String cabecera(HttpExchange ex, String nombre) {
        return ex.getRequestHeaders().getFirst(nombre);
    }

    private static void responder(HttpExchange ex, int codigo, String cuerpo) throws IOException {
        byte[] b = cuerpo.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "text/plain; charset=utf-8");
        ex.sendResponseHeaders(codigo, b.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(b);
        }
    }

    private static int parsePuerto(String s) {
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return PUERTO;
        }
    }

    private Conector() {
    }
}
