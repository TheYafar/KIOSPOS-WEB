import { useEffect, useState } from "react";
import { anularRecarga, recargasTurno, registrarRecarga, turnoActual, type Operadora, type RecargaV } from "../api";
import { leerMonto } from "../arqueo";
import { getTasa } from "../session";

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const OPERADORAS: [Operadora, string, string][] = [
  ["MOVISTAR", "Movistar", "#1c6fd1"], ["DIGITEL", "Digitel", "#d62d2d"], ["MOVILNET", "Movilnet", "#e08a00"],
  ["CANTV", "CANTV", "#0f7a6c"], ["SIMPLE_TV", "Simple TV", "#7a3bc4"], ["INTER", "Inter", "#2a8f3c"], ["OTRA", "Otra", "#6b6a64"],
];
const METODOS: [string, string][] = [["EFECTIVO_BS", "Efectivo Bs"], ["EFECTIVO_USD", "Efectivo $"], ["PAGO_MOVIL", "Pago móvil"], ["PUNTO", "Punto"], ["BIOPAGO", "Biopago"]];
const MONTOS = [100, 200, 300, 500, 1000];
const PCT_KEY = "kp_recarga_pct";
const nombreOp = (o: string) => OPERADORAS.find((x) => x[0] === o)?.[1] || o;
const nombreMet = (m: string) => METODOS.find((x) => x[0] === m)?.[1] || m;

/** Lo que se le cobra al cliente: recarga + comisión, en Bs; en $ si paga en dólares (redondeado al céntimo hacia arriba). */
export function cobroRecarga(montoBs: number, pct: number, metodo: string, tasa: number): { cobrado: number; moneda: "USD" | "VES"; enBs: number } {
  if (!(montoBs > 0)) return { cobrado: 0, moneda: metodo === "EFECTIVO_USD" ? "USD" : "VES", enBs: 0 };
  const bs = Math.ceil(montoBs * (1 + pct / 100) * 100 - 1e-6) / 100;
  if (metodo === "EFECTIVO_USD") {
    const usd = Math.ceil((bs / (tasa || 1)) * 100 - 1e-6) / 100;
    return { cobrado: usd, moneda: "USD", enBs: Math.round(usd * tasa * 100) / 100 };
  }
  return { cobrado: bs, moneda: "VES", enBs: bs };
}

/** Ventana de recargas de la caja: registrar una y ver/anular las del turno. */
export function Recargas({ onClose }: { onClose: () => void }) {
  const tasa = Number(getTasa()) || 0;
  const [turnoId, setTurnoId] = useState<number | null | undefined>(undefined);
  const [lista, setLista] = useState<RecargaV[]>([]);
  const [op, setOp] = useState<Operadora | null>(null);
  const [numero, setNumero] = useState("");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("EFECTIVO_BS");
  const [pct, setPct] = useState(() => { try { return localStorage.getItem(PCT_KEY) || "0"; } catch { return "0"; } });
  const [cobradoTxt, setCobradoTxt] = useState("");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = (id: number) => recargasTurno(id).then(setLista).catch(() => {});
  useEffect(() => { turnoActual().then((t) => { const id = t && t.turnoId ? t.turnoId : null; setTurnoId(id); if (id) cargar(id); }).catch(() => setTurnoId(null)); }, []);

  const m = leerMonto(monto) ?? 0;
  const auto = cobroRecarga(m, leerMonto(pct) ?? 0, metodo, tasa);
  const cobrado = cobradoTxt ? (leerMonto(cobradoTxt) ?? 0) : auto.cobrado;
  const enBs = metodo === "EFECTIVO_USD" ? Math.round(cobrado * tasa * 100) / 100 : cobrado;
  const ganancia = Math.round((enBs - m) * 100) / 100;
  const digital = ["PAGO_MOVIL", "PUNTO", "BIOPAGO"].includes(metodo);
  const numOk = numero.replace(/\D/g, "").length >= 4;
  const falta = !op ? "Elige la operadora" : !numOk ? "Escribe el número" : m <= 0 ? "Escribe el monto" : ganancia < -(tasa / 100) ? "Lo cobrado es menos que la recarga" : "";

  const guardar = async () => {
    if (falta || enviando || !op) return;
    setEnviando(true); setErr(""); setOk("");
    try {
      try { localStorage.setItem(PCT_KEY, pct); } catch { /* */ }
      await registrarRecarga({ operadora: op, numero: numero.trim(), montoBs: m, metodoCobro: metodo, montoCobrado: cobrado, tasa, ...(ref.trim() ? { referencia: ref.trim() } : {}) });
      setOk(`Recarga ${nombreOp(op)} de Bs ${money(m)} registrada ✓`);
      setNumero(""); setMonto(""); setCobradoTxt(""); setRef("");
      window.dispatchEvent(new Event("kp-turno"));
      if (turnoId) cargar(turnoId);
    } catch (e) { setErr((e as Error).message); }
    finally { setEnviando(false); }
  };
  const anular = async (r: RecargaV) => {
    if (!window.confirm(`¿Anular la recarga ${nombreOp(r.operadora)} de Bs ${money(r.montoBs)} al ${r.numero}?`)) return;
    try { await anularRecarga(r.id); if (turnoId) cargar(turnoId); window.dispatchEvent(new Event("kp-turno")); } catch (e) { setErr((e as Error).message); }
  };
  // Enter registra desde cualquier parte (también tras tocar una operadora o forma de pago),
  // salvo en el botón de abajo, en Cerrar o en anular, que hacen lo suyo.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target as HTMLElement).closest(".modal-foot, .hdel, .ghost")) { e.preventDefault(); guardar(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };
  const vivas = lista.filter((r) => !r.anulada);

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card rec-card" role="dialog" aria-label="Recargas" onKeyDown={onKey}>
        <div className="modal-head"><h2>Recarga de saldo</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          {turnoId === null && <p className="pinmsg err">La caja está cerrada. Ábrela en Cierre para hacer recargas.</p>}
          <div className="rec-ops" role="radiogroup" aria-label="Operadora">
            {OPERADORAS.map(([id, n, c]) => (
              <button key={id} role="radio" aria-checked={op === id} className={"rec-op press" + (op === id ? " on" : "")} style={{ ["--op" as string]: c }} onClick={() => setOp(id)}>
                <i />{n}
              </button>
            ))}
          </div>
          <div className="two">
            <label className="lbl">Número o contrato<input className="inp t" inputMode="tel" autoFocus value={numero} maxLength={20} onChange={(e) => setNumero(e.target.value.replace(/[^\d-]/g, ""))} placeholder="0414-1234567" aria-label="Número a recargar" /></label>
            <label className="lbl">Monto de la recarga (Bs)<input className="inp t" inputMode="decimal" value={monto} onChange={(e) => { setMonto(e.target.value.replace(/[^\d.,]/g, "")); setCobradoTxt(""); }} placeholder="0,00" aria-label="Monto de la recarga" /></label>
          </div>
          <div className="chips">{MONTOS.map((x) => <button key={x} className={"chip press" + (m === x ? " on" : "")} onClick={() => { setMonto(String(x)); setCobradoTxt(""); }}>Bs {x}</button>)}</div>
          <div className="lbl">¿Cómo te paga el cliente?
            <div className="seg cfg-seg rec-met">{METODOS.map(([id, n]) => <button key={id} className={metodo === id ? "on" : ""} onClick={() => { setMetodo(id); setCobradoTxt(""); }}>{n}</button>)}</div>
          </div>
          <div className="two">
            <label className="lbl">Tu comisión %<input className="inp t" inputMode="decimal" value={pct} onChange={(e) => { setPct(e.target.value.replace(/[^\d.,]/g, "")); setCobradoTxt(""); }} aria-label="Comisión de la recarga" /></label>
            <label className="lbl">Le cobras ({metodo === "EFECTIVO_USD" ? "$" : "Bs"})<input className="inp t" inputMode="decimal" placeholder={money(auto.cobrado)} value={cobradoTxt} onChange={(e) => setCobradoTxt(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Monto que paga el cliente" /></label>
          </div>
          {digital && <label className="lbl">Referencia (opcional)<input className="inp t" value={ref} maxLength={60} onChange={(e) => setRef(e.target.value)} aria-label="Referencia del pago" /></label>}
          {m > 0 && (
            <div className="mov-av">
              <div><span>Le cobras</span><b className="t">{metodo === "EFECTIVO_USD" ? "$ " + money(cobrado) : "Bs " + money(cobrado)}</b></div>
              <div><span>Recargas</span><b className="t">Bs {money(m)}</b></div>
              <div className={ganancia >= 0 ? "ok" : "bad"}><span>Tu ganancia</span><b className="t">Bs {money(Math.max(0, ganancia))}</b></div>
            </div>
          )}
          {err && <p className="pinmsg err">{err}</p>}
          {ok && <p className="pinmsg ok" role="status">{ok}</p>}
          {lista.length > 0 && (
            <div className="rec-hist">
              <div className="rec-hist-h"><b>Recargas de este turno</b><span className="t">{vivas.length} · Bs {money(vivas.reduce((s, r) => s + r.montoBs, 0))} · ganancia Bs {money(vivas.reduce((s, r) => s + r.comisionBs, 0))}</span></div>
              {lista.map((r) => (
                <div key={r.id} className={"movs-row" + (r.anulada ? " anulado" : "")}>
                  <span className="movs-tag" style={{ ["--mc" as string]: OPERADORAS.find((x) => x[0] === r.operadora)?.[2] }}>{nombreOp(r.operadora)}</span>
                  <span className="movs-con t">{r.numero}<small> · {nombreMet(r.metodoCobro)}</small></span>
                  <b className="t movs-m">Bs {money(r.montoBs)}</b>
                  {r.anulada ? <span className="pill">Anulada</span> : <button className="hdel" aria-label={"Anular recarga " + r.numero} title="Anular" onClick={() => anular(r)}>✕</button>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!!falta || enviando || !turnoId} onClick={guardar}>
          {enviando ? "Guardando…" : falta || "Registrar recarga"} {!falta && <kbd className="kb">Enter</kbd>}</button></div>
      </div>
    </div>
  );
}


