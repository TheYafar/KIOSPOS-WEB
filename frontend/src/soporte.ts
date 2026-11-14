// Soporte por WhatsApp (uriel). Un solo lugar para el número y los mensajes.
export const WHATSAPP_SOPORTE = "584124682180";
export const WHATSAPP_VISIBLE = "0412-468-2180";

/** Enlace wa.me con el mensaje ya escrito. */
export function linkWhatsApp(mensaje: string): string {
  return "https://wa.me/" + WHATSAPP_SOPORTE + "?text=" + encodeURIComponent(mensaje);
}

/** Enlace para mandarse algo a sí mismo (WhatsApp deja elegir el chat, p. ej. "Tú"). */
export function linkGuardarEnWhatsApp(texto: string): string {
  return "https://wa.me/?text=" + encodeURIComponent(texto);
}
