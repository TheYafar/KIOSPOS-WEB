package com.kioskpos.web.correo;

import jakarta.mail.internet.MimeMessage;
import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Envío de correos transaccionales a los clientes (dueños). Va por SMTP, así que es
 * agnóstico del proveedor (Resend/Brevo/SES) — solo cambian las variables de entorno.
 *
 * A prueba de fallos: todo envío es asíncrono y, si el correo no está configurado
 * ({@code kioskpos.mail.enabled=false} o sin {@code MAIL_HOST}) o falla, NO se propaga
 * el error — nunca debe romper un alta de negocio, una venta ni un login.
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final ObjectProvider<JavaMailSender> senderProvider;
    private final boolean enabled;
    private final String from;
    private final String appUrl;

    public EmailService(ObjectProvider<JavaMailSender> senderProvider,
                        @Value("${kioskpos.mail.enabled:false}") boolean enabled,
                        @Value("${kioskpos.mail.from:KioskPOS <onboarding@resend.dev>}") String from,
                        @Value("${kioskpos.mail.app-url:https://app.kioskpos.app}") String appUrl) {
        this.senderProvider = senderProvider;
        this.enabled = enabled;
        this.from = from;
        this.appUrl = appUrl;
    }

    /** Bienvenida al dueño cuando se da de alta su negocio, con su acceso. */
    @Async
    public void bienvenida(String correo, String nombreDueno, String nombreNegocio) {
        String saludo = nombreDueno != null && !nombreDueno.isBlank() ? nombreDueno : "Hola";
        String html = """
                <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#151513;max-width:520px;margin:0 auto">
                  <h2 style="color:#0F766E">¡Bienvenido a KioskPOS, %s!</h2>
                  <p>Ya creamos tu negocio <b>%s</b>. Entra con tu correo (<b>%s</b>) y la contraseña que te compartieron,
                     desde cualquier dispositivo.</p>
                  <p style="margin:22px 0">
                    <a href="%s" style="background:#0F766E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Entrar a mi negocio</a>
                  </p>
                  <p style="color:#5c5b55;font-size:14px">Primeros pasos: crea tu caja, agrega tus cajeros y carga tu inventario.
                     La app te guía al entrar.</p>
                  <p style="color:#908e86;font-size:12px">KioskPOS · punto de venta para bodegas</p>
                </div>
                """.formatted(escapar(saludo), escapar(nombreNegocio), escapar(correo), appUrl);
        enviar(correo, "Bienvenido a KioskPOS", html);
    }

    /** Aviso de que el super admin aprobó un pago de la mensualidad. */
    @Async
    public void pagoAprobado(String correo, String nombreNegocio, LocalDate pagoHasta) {
        String hasta = pagoHasta != null ? pagoHasta.toString() : "—";
        String html = """
                <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#151513;max-width:520px;margin:0 auto">
                  <h2 style="color:#1b8448">Pago recibido ✓</h2>
                  <p>Aprobamos el pago de <b>%s</b>. Tu servicio queda activo <b>hasta el %s</b>. ¡Gracias!</p>
                  <p style="color:#908e86;font-size:12px">KioskPOS · punto de venta para bodegas</p>
                </div>
                """.formatted(escapar(nombreNegocio), hasta);
        enviar(correo, "Pago recibido — KioskPOS", html);
    }

    private void enviar(String to, String asunto, String html) {
        if (!enabled) {
            log.debug("Correo deshabilitado; no se envía \"{}\" a {}", asunto, to);
            return;
        }
        JavaMailSender sender = senderProvider.getIfAvailable();
        if (sender == null || to == null || to.isBlank()) {
            return;
        }
        try {
            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, false, "UTF-8");
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject(asunto);
            helper.setText(html, true);
            sender.send(msg);
            log.info("Correo enviado: \"{}\" a {}", asunto, to);
        } catch (Exception e) {
            log.warn("No se pudo enviar el correo \"{}\" a {}: {}", asunto, to, e.getMessage());
        }
    }

    private static String escapar(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
