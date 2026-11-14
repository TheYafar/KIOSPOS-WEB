import { useState } from "react";
import { linkGuardarEnWhatsApp, linkWhatsApp, WHATSAPP_VISIBLE } from "../soporte";

const IcoWs = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.6-5.4A8.5 8.5 0 1 1 21 11.5Z" />
    <path d="M8.5 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.5 1-1l-1.5-1-1 .7c-1-.4-1.8-1.2-2.2-2.2l.7-1-1-1.5c-.5 0-1 .4-1 1Z" />
  </svg>
);

/** Enlace de ayuda por WhatsApp (soporte de KioskPOS). */
export function AyudaWhatsApp({ mensaje = "Hola, necesito ayuda con KioskPOS.", texto, boton = false }: { mensaje?: string; texto?: string; boton?: boolean }) {
  return (
    <a className={boton ? "btn ws-btn press" : "ws-link"} href={linkWhatsApp(mensaje)} target="_blank" rel="noopener noreferrer">
      <span className="ws-ic"><IcoWs /></span>
      <span>{texto ?? <>¿Necesitas ayuda? Escríbenos por WhatsApp <b>{WHATSAPP_VISIBLE}</b></>}</span>
    </a>
  );
}

/**
 * Muestra el código de recuperación UNA vez, con copiar y "guardármelo en WhatsApp".
 * `onGuardado` se llama cuando la persona confirma que lo guardó.
 */
export function CodigoRecuperacion({ codigo, onGuardado }: { codigo: string; onGuardado?: (ok: boolean) => void }) {
  const [copiado, setCopiado] = useState(false);
  const [ok, setOk] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { setCopiado(false); }
  };
  return (
    <div className="rec-box">
      <div className="rec-h"><b>Tu código de recuperación</b><span>Si olvidas tu contraseña, con tu correo y este código pones una nueva tú mismo. Guárdalo donde no lo pierdas.</span></div>
      <div className="rec-code t" aria-label="Código de recuperación">{codigo}</div>
      <div className="rec-acc">
        <button type="button" className="btn2 press" onClick={copiar}>{copiado ? "✓ Copiado" : "Copiar"}</button>
        <a className="btn2 press" href={linkGuardarEnWhatsApp("Mi código de recuperación de KioskPOS: " + codigo)} target="_blank" rel="noopener noreferrer">Guardármelo en WhatsApp</a>
      </div>
      {onGuardado && (
        <label className="rec-ok"><input type="checkbox" checked={ok} onChange={(e) => { setOk(e.target.checked); onGuardado(e.target.checked); }} /> Ya lo guardé</label>
      )}
    </div>
  );
}
