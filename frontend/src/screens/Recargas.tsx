import { useEffect, useState } from "react";
import { anularRecarga, recargasTurno, turnoActual, type Operadora, type RecargaV, type ServicioCobro } from "../api";
import { leerMonto } from "../arqueo";
import { getConfig } from "../config";
import { getTasa } from "../session";

// Recargas y avances de efectivo se agregan a la VENTA como una línea más (con su monto en Bs
// exacto) y el cliente paga todo junto, con la forma de pago que quiera.

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const OPERADORAS: [Operadora, string, string][] = [
  ["MOVISTAR", "Movistar", "#1c6fd1"], ["DIGITEL", "Digitel", "#d62d2d"], ["MOVILNET", "Movilnet", "#e08a00"],
  ["CANTV", "CANTV", "#0f7a6c"], ["SIMPLE_TV", "Simple TV", "#7a3bc4"], ["INTER", "Inter", "#2a8f3c"], ["OTRA", "Otra", "#6b6a64"],
];
const MONTOS = [100, 200, 300, 500, 1000];
const nombreOp = (o: string) => OPERADORAS.find((x) => x[0] === o)?.[1] || o;

/** Monto + comisión, en Bs, redondeado al céntimo hacia arriba. */
export const conComision = (montoBs: number, pct: number) => (montoBs > 0 ? Math.ceil(montoBs * (1 + pct / 100) * 100 - 1e-6) / 100 : 0);

/** Un servicio listo para la venta, con el texto que se ve en el ticket. */
export interface ServicioCarrito { servicio: ServicioCobro; nombre: string; detalle: string; }

/** Ventana de recargas: arma la recarga y la agrega a la venta. */
export function Recargas({ onClose, onAgregar }: { onClose: () => void; onAgregar: (s: ServicioCarrito) => void }) {
  const [turnoId, setTurnoId] = useState<number | null | undefined>(undefined);
  const [lista, setLista] = useState<RecargaV[]>([]);
  const [op, setOp] = useState<Operadora | null>(null);
  const [numero, setNumero] = useState("");
  const [monto, setMonto] = useState("");
  const [pct, setPct] = useState(() => String(getConfig().comisionRecargaPct).replace(".", ","));
  const [cobradoTxt, setCobradoTxt] = useState("");
  const [err, setErr] = useState("");

  const cargar = (id: number) => recargasTurno(id).then(setLista).catch(() => {});
  useEffect(() => { turnoActual().then((t) => { const id = t && t.turnoId ? t.turnoId : null; setTurnoId(id); if (id) cargar(id); }).catch(() => setTurnoId(null)); }, []);

  const m = leerMonto(monto) ?? 0;
  const auto = conComision(m, leerMonto(pct) ?? 0);
  const cobrado = cobradoTxt ? (leerMonto(cobradoTxt) ?? 0) : auto;
  const ganancia = Math.round((cobrado - m) * 100) / 100;
  const numOk = numero.replace(/\D/g, "").length >= 4;
  const falta = !op ? "Elige la operadora" : !numOk ? "Escribe el número" : m <= 0 ? "Escribe el monto" : ganancia < 0 ? "Lo cobrado es menos que la recarga" : "";

  const agregar = () => {
    if (falta || !op) return;
    onAgregar({
      servicio: { tipo: "RECARGA", operadora: op, numero: numero.trim(), montoBs: m, cobradoBs: cobrado },
      nombre: "Recarga " + nombreOp(op) + " " + numero.trim(),
      detalle: "Bs " + money(m) + (ganancia > 0 ? " + comisión Bs " + money(ganancia) : ""),
    });
  };
  const anular = async (r: RecargaV) => {
    if (!window.confirm(`¿Anular la recarga ${nombreOp(r.operadora)} de Bs ${money(r.montoBs)} al ${r.numero}?`)) return;
    try { await anularRecarga(r.id); if (turnoId) cargar(turnoId); window.dispatchEvent(new Event("kp-turno")); } catch (e) { setErr((e as Error).message); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target as HTMLElement).closest(".modal-foot, .hdel, .ghost")) { e.preventDefault(); agregar(); }
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
          <div className="two">
            <label className="lbl">Tu comisión %<input className="inp t" inputMode="decimal" value={pct} onChange={(e) => { setPct(e.target.value.replace(/[^\d.,]/g, "")); setCobradoTxt(""); }} aria-label="Comisión de la recarga" /></label>
            <label className="lbl">Le cobras (Bs)<input className="inp t" inputMode="decimal" placeholder={money(auto)} value={cobradoTxt} onChange={(e) => setCobradoTxt(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Monto que paga el cliente" /></label>
          </div>
          {m > 0 && (
            <div className="mov-av">
              <div><span>Le cobras</span><b className="t">Bs {money(cobrado)}</b></div>
              <div><span>Recargas</span><b className="t">Bs {money(m)}</b></div>
              <div className={ganancia >= 0 ? "ok" : "bad"}><span>Tu ganancia</span><b className="t">Bs {money(Math.max(0, ganancia))}</b></div>
            </div>
          )}
          <span className="hint">Se agrega a la venta y el cliente la paga junto con lo demás, como quiera (efectivo, punto, pago móvil…).</span>
          {err && <p className="pinmsg err">{err}</p>}
          {lista.length > 0 && (
            <div className="rec-hist">
              <div className="rec-hist-h"><b>Recargas de este turno</b><span className="t">{vivas.length} · Bs {money(vivas.reduce((s, r) => s + r.montoBs, 0))} · ganancia Bs {money(vivas.reduce((s, r) => s + r.comisionBs, 0))}</span></div>
              {lista.map((r) => (
                <div key={r.id} className={"movs-row" + (r.anulada ? " anulado" : "")}>
                  <span className="movs-tag" style={{ ["--mc" as string]: OPERADORAS.find((x) => x[0] === r.operadora)?.[2] }}>{nombreOp(r.operadora)}</span>
                  <span className="movs-con t">{r.numero}<small> · {r.metodoCobro === "VENTA" ? "en una venta" : r.metodoCobro}</small></span>
                  <b className="t movs-m">Bs {money(r.montoBs)}</b>
                  {r.anulada ? <span className="pill">Anulada</span> : r.ventaId ? <span className="pill">Venta</span>
                    : <button className="hdel" aria-label={"Anular recarga " + r.numero} title="Anular" onClick={() => anular(r)}>✕</button>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!!falta || !turnoId} onClick={agregar}>
          {falta || "Agregar a la venta · Bs " + money(cobrado)} {!falta && <kbd className="kb">Enter</kbd>}</button></div>
      </div>
    </div>
  );
}

/** Avance de efectivo: se le da efectivo al cliente y lo paga (con comisión) junto con la venta. */
export function AvanceEfectivo({ tasa, onClose, onAgregar }: { tasa: number; onClose: () => void; onAgregar: (s: ServicioCarrito) => void }) {
  const [moneda, setMoneda] = useState<"VES" | "USD">("VES");
  const [monto, setMonto] = useState("");
  const [pct, setPct] = useState(() => String(getConfig().comisionAvancePct).replace(".", ","));
  const [cobradoTxt, setCobradoTxt] = useState("");
  const t = tasa || Number(getTasa()) || 0;
  const m = leerMonto(monto) ?? 0;
  const entregadoBs = moneda === "USD" ? Math.round(m * t * 100) / 100 : m;
  const auto = conComision(entregadoBs, leerMonto(pct) ?? 0);
  const cobrado = cobradoTxt ? (leerMonto(cobradoTxt) ?? 0) : auto;
  const ganancia = Math.round((cobrado - entregadoBs) * 100) / 100;
  const falta = m <= 0 ? "Escribe cuánto efectivo le das" : ganancia < 0 ? "Lo cobrado es menos que el efectivo" : "";
  const agregar = () => {
    if (falta) return;
    onAgregar({
      servicio: { tipo: "AVANCE", entregaMoneda: moneda, entregaMonto: m, cobradoBs: cobrado },
      nombre: "Avance de efectivo",
      detalle: "Le das " + (moneda === "USD" ? "$ " : "Bs ") + money(m) + (ganancia > 0 ? " + comisión Bs " + money(ganancia) : ""),
    });
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card rec-card" role="dialog" aria-label="Avance de efectivo"
        onKeyDown={(e) => { if (e.key === "Enter" && !(e.target as HTMLElement).closest(".modal-foot, .ghost")) { e.preventDefault(); agregar(); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
        <div className="modal-head"><h2>Avance de efectivo</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">El cliente te paga (por punto, pago móvil…) el efectivo más tu comisión, y tú le das el efectivo de la gaveta.</span>
          <div className="seg cfg-seg" role="tablist" aria-label="¿En qué moneda le das el efectivo?">
            <button role="tab" aria-selected={moneda === "VES"} className={moneda === "VES" ? "on" : ""} onClick={() => { setMoneda("VES"); setCobradoTxt(""); }}>En bolívares</button>
            <button role="tab" aria-selected={moneda === "USD"} className={moneda === "USD" ? "on" : ""} onClick={() => { setMoneda("USD"); setCobradoTxt(""); }}>En dólares</button>
          </div>
          <div className="two">
            <label className="lbl">Efectivo que le das ({moneda === "USD" ? "$" : "Bs"})<input className="inp t" inputMode="decimal" autoFocus value={monto} placeholder="0,00"
              onChange={(e) => { setMonto(e.target.value.replace(/[^\d.,]/g, "")); setCobradoTxt(""); }} aria-label="Efectivo del avance" /></label>
            <label className="lbl">Tu comisión %<input className="inp t" inputMode="decimal" value={pct} onChange={(e) => { setPct(e.target.value.replace(/[^\d.,]/g, "")); setCobradoTxt(""); }} aria-label="Comisión del avance" /></label>
          </div>
          <label className="lbl">Le cobras (Bs)<input className="inp t" inputMode="decimal" placeholder={money(auto)} value={cobradoTxt} onChange={(e) => setCobradoTxt(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Monto que paga el cliente por el avance" /></label>
          {m > 0 && (
            <div className="mov-av">
              <div><span>Le cobras</span><b className="t">Bs {money(cobrado)}</b></div>
              <div><span>Le das</span><b className="t">{moneda === "USD" ? "$ " + money(m) : "Bs " + money(m)}</b></div>
              <div className={ganancia >= 0 ? "ok" : "bad"}><span>Tu ganancia</span><b className="t">Bs {money(Math.max(0, ganancia))}</b></div>
            </div>
          )}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!!falta} onClick={agregar}>
          {falta || "Agregar a la venta · Bs " + money(cobrado)} {!falta && <kbd className="kb">Enter</kbd>}</button></div>
      </div>
    </div>
  );
}
