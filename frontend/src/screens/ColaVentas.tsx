import { useEffect, useState } from "react";
import { descartarDeCola, marcarEnCola, sincronizar, ventasEnCola } from "../api";
import type { VentaEnCola } from "../outbox";
import { UIcono } from "../icons";

const usd = (n: number) => "$ " + Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hora = (ms: number) => new Date(ms).toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Ventas cobradas que todavía no llegan al servidor (sin internet o rechazadas). */
export function useCola(): VentaEnCola[] {
  const [cola, setCola] = useState<VentaEnCola[]>([]);
  useEffect(() => {
    let vivo = true;
    const leer = () => { ventasEnCola().then((c) => { if (vivo) setCola(c); }).catch(() => {}); };
    leer();
    const id = setInterval(leer, 30 * 1000);
    window.addEventListener("kp-cola", leer);
    return () => { vivo = false; clearInterval(id); window.removeEventListener("kp-cola", leer); };
  }, []);
  return cola;
}

/** Botón del encabezado: solo aparece si hay ventas sin enviar. Rojo si alguna fue rechazada. */
export function ColaPill({ cola, onClick }: { cola: VentaEnCola[]; onClick: () => void }) {
  if (cola.length === 0) return null;
  const errores = cola.filter((v) => v.estado === "error").length;
  return (
    <button className={"hpill cola-pill press" + (errores ? " err" : "")} onClick={onClick}
      title={errores ? "Hay ventas rechazadas por el servidor: revísalas" : "Ventas guardadas en este equipo, esperando conexión"}>
      <span className="dot" /><b>{errores ? errores + " con error" : cola.length + " sin enviar"}</b>
    </button>
  );
}

export function ColaModal({ cola, onClose }: { cola: VentaEnCola[]; onClose: () => void }) {
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const reintentar = async (codigo?: string) => {
    setOcupado(true); setMsg("");
    try {
      for (const v of cola) if ((!codigo || v.codigoUnico === codigo) && v.estado === "error") await marcarEnCola(v.codigoUnico, { estado: "pendiente" });
      const r = await sincronizar();
      setMsg(r.enviadas > 0 ? r.enviadas + " venta(s) enviada(s)." : r.errores > 0 ? "El servidor la sigue rechazando. Mira el motivo." : "Sin conexión: se enviará sola al volver el internet.");
    } finally { setOcupado(false); }
  };
  const descartar = async (v: VentaEnCola) => {
    if (!window.confirm("¿Descartar esta venta de " + usd(v.resumen?.totalUsd ?? 0) + "? No quedará registrada en el sistema (si cobraste, anótala aparte).")) return;
    await descartarDeCola(v.codigoUnico);
    window.dispatchEvent(new Event("kp-cola"));
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-label="Ventas sin enviar">
        <div className="modal-head"><h2>Ventas sin enviar</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <p className="hint">Estas ventas se cobraron y están guardadas en este equipo. Las que esperan conexión se envían solas; las que tienen error necesitan que las revises.</p>
          {cola.length === 0 && <p className="noresult">Todo enviado ✓</p>}
          <div className="cola-list">
            {cola.map((v) => (
              <div key={v.codigoUnico} className={"card cola-it" + (v.estado === "error" ? " err" : "")}>
                <div className="cola-top">
                  <span className="cola-ic"><UIcono k={v.estado === "error" ? "alert" : "recibo"} sw={2} /></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b>{v.resumen?.productos || "Venta"}</b>
                    <small>{hora(v.creadoAt)} · {v.estado === "error" ? "Rechazada" : "Esperando conexión"}{v.intentos > 0 ? " · " + v.intentos + " intento(s)" : ""}</small>
                  </div>
                  <b className="t">{v.resumen ? usd(v.resumen.totalUsd) : ""}</b>
                </div>
                {v.estado === "error" && v.ultimoError && <p className="cola-err">{v.ultimoError}</p>}
                {v.estado === "error" && (
                  <div className="cola-acc">
                    <button className="btn2 press" onClick={() => descartar(v)}>Descartar</button>
                    <button className="btn primary press" disabled={ocupado} onClick={() => reintentar(v.codigoUnico)}>Reintentar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {msg && <p className="pinmsg">{msg}</p>}
        </div>
        <div className="modal-foot">
          <button className="btn primary big press" disabled={ocupado || cola.length === 0} onClick={() => reintentar()}>{ocupado ? "Enviando…" : "Enviar ahora"}</button>
        </div>
      </div>
    </div>
  );
}
