import { useEffect, useState } from "react";
import { anularMovimiento, movimientosTurno, registrarMovimiento, type MovimientoCaja, type TipoMov } from "../api";
import { UIcono } from "../icons";
import { leerMonto } from "../arqueo";

// Movimientos de efectivo del turno que no son ventas: gastos, retiros del dueño,
// ingresos (sencillo) y avances de efectivo. Todos cambian lo que debe haber en la gaveta.

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (moneda: string, n: number) => (moneda === "USD" ? "$ " : "Bs ") + money(n);
const PCT_KEY = "kp_avance_pct";

export const TIPOS: Record<TipoMov, { n: string; sub: string; icon: string; color: string; signo: "−" | "+" }> = {
  GASTO: { n: "Gasto", sub: "Pagaste algo con plata de la caja", icon: "recibo", color: "var(--bad)", signo: "−" },
  RETIRO: { n: "Retiro", sub: "El dueño se lleva efectivo", icon: "user", color: "var(--warn)", signo: "−" },
  INGRESO: { n: "Ingreso", sub: "Metes efectivo (ej. sencillo)", icon: "plus", color: "var(--ok)", signo: "+" },
  AVANCE: { n: "Avance", sub: "Cobras por punto y das efectivo", icon: "card", color: "var(--c-bebidas)", signo: "−" },
};
const PRESETS: Record<string, string[]> = {
  GASTO: ["Hielo", "Bolsas", "Transporte", "Comida", "Limpieza", "Pago a proveedor"],
  RETIRO: ["Retiro del dueño", "Depósito al banco"],
  INGRESO: ["Sencillo para vueltos", "Aporte del dueño"],
};
const METODOS_AV = [["PUNTO", "Punto"], ["PAGO_MOVIL", "Pago móvil"], ["BIOPAGO", "Biopago"]] as const;

export function MovimientosCaja({ turnoId, tasa, onCambio }: { turnoId: number; tasa: number; onCambio: () => void }) {
  const [lista, setLista] = useState<MovimientoCaja[]>([]);
  const [form, setForm] = useState<TipoMov | null>(null);
  const [err, setErr] = useState("");
  const cargar = () => movimientosTurno(turnoId).then(setLista).catch(() => {});
  useEffect(() => { cargar(); }, [turnoId]);
  // Atajos: G gasto · R retiro · I ingreso · A avance (fuera de casillas de texto).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (form || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const t = ({ g: "GASTO", r: "RETIRO", i: "INGRESO" } as Record<string, TipoMov>)[e.key.toLowerCase()];
      if (t) { e.preventDefault(); setForm(t); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [form]);

  const anular = async (m: MovimientoCaja) => {
    if (!window.confirm(`¿Anular ${TIPOS[m.tipo].n.toLowerCase()} de ${fmt(m.moneda, m.monto)} (${m.concepto})?`)) return;
    try { await anularMovimiento(m.id); await cargar(); onCambio(); } catch (e) { setErr((e as Error).message); }
  };
  const vivos = lista.filter((m) => !m.anulado);

  return (
    <div className="card movs">
      <div className="movs-head">
        <div><h3 className="h3">Movimientos de caja</h3><span className="hint">Todo efectivo que entra o sale sin ser venta. <span className="kbtip">G gasto · R retiro · I ingreso</span> Los avances de efectivo se cobran en Vender (F6), junto con la venta.</span></div>
      </div>
      <div className="movs-btns">
        {(Object.keys(TIPOS) as TipoMov[]).filter((t) => t !== "AVANCE").map((t) => (
          <button key={t} className="movs-btn press" onClick={() => { setErr(""); setForm(t); }} style={{ ["--mc" as string]: TIPOS[t].color }}>
            <span className="co2-ic"><UIcono k={TIPOS[t].icon} sw={1.9} /></span>
            <span><b>{TIPOS[t].n}</b><small>{TIPOS[t].sub}</small></span>
          </button>
        ))}
      </div>
      {err && <p className="pinmsg err">{err}</p>}
      {lista.length > 0 && (
        <div className="movs-list">
          {lista.map((m) => (
            <div key={m.id} className={"movs-row" + (m.anulado ? " anulado" : "")}>
              <span className="movs-tag" style={{ ["--mc" as string]: TIPOS[m.tipo].color }}>{TIPOS[m.tipo].n}</span>
              <span className="movs-con">{m.concepto}{m.tipo === "AVANCE" && m.montoCobrado != null && <small> · cobrado Bs {money(m.montoCobrado)} {m.metodoCobro === "VENTA" ? "en la venta" : "por " + (m.metodoCobro === "PAGO_MOVIL" ? "pago móvil" : (m.metodoCobro || "").toLowerCase())} · ganancia Bs {money(m.comision || 0)}</small>}</span>
              <b className={"t movs-m " + (TIPOS[m.tipo].signo === "+" ? "mas" : "menos")}>{TIPOS[m.tipo].signo} {fmt(m.moneda, m.monto)}</b>
              {m.anulado ? <span className="pill">Anulado</span> : <button className="hdel" aria-label={"Anular " + m.concepto} title="Anular" onClick={() => anular(m)}>✕</button>}
            </div>
          ))}
        </div>
      )}
      {vivos.length === 0 && <p className="hint movs-vacio">Sin movimientos en este turno.</p>}
      {form && <FormMov tipo={form} tasa={tasa} onClose={() => setForm(null)} onSaved={() => { setForm(null); cargar(); onCambio(); }} />}
    </div>
  );
}

function FormMov({ tipo, tasa, onClose, onSaved }: { tipo: TipoMov; tasa: number; onClose: () => void; onSaved: () => void }) {
  const av = tipo === "AVANCE";
  const [moneda, setMoneda] = useState<"USD" | "VES">(av ? "VES" : "USD");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [metodo, setMetodo] = useState<string>("PUNTO");
  const [pct, setPct] = useState(() => { try { return localStorage.getItem(PCT_KEY) || "10"; } catch { return "10"; } });
  const [cobradoTxt, setCobradoTxt] = useState("");
  const [err, setErr] = useState("");
  const [enviando, setEnviando] = useState(false);
  const m = leerMonto(monto) ?? 0;
  const entregadoBs = moneda === "USD" ? Math.round(m * tasa * 100) / 100 : m;
  const p = leerMonto(pct) ?? 0;
  const cobradoAuto = Math.ceil(entregadoBs * (1 + p / 100) * 100 - 1e-6) / 100;
  const cobrado = cobradoTxt ? (leerMonto(cobradoTxt) ?? 0) : cobradoAuto;
  const ganancia = Math.round((cobrado - entregadoBs) * 100) / 100;
  const listo = m > 0 && (av ? cobrado >= entregadoBs : concepto.trim().length > 0) && !enviando;

  const guardar = async () => {
    if (!listo) return;
    setEnviando(true); setErr("");
    try {
      if (av) { try { localStorage.setItem(PCT_KEY, pct); } catch { /* */ } }
      await registrarMovimiento({ tipo, moneda, monto: m, concepto: concepto.trim(), ...(av ? { metodoCobro: metodo, montoCobrado: cobrado, tasa } : {}) });
      onSaved();
    } catch (e) { setErr((e as Error).message); setEnviando(false); }
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); guardar(); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onKeyDown={onKey}>
        <div className="modal-head"><h2>{av ? "Avance de efectivo" : TIPOS[tipo].n}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">{av ? "El cliente te paga por punto o pago móvil y le das efectivo. La comisión es tu ganancia." : TIPOS[tipo].sub + ". Queda en el cierre de caja."}</span>
          <div className="seg cfg-seg" role="tablist" aria-label="Moneda">
            <button className={moneda === "USD" ? "on" : ""} onClick={() => setMoneda("USD")}>Dólares</button>
            <button className={moneda === "VES" ? "on" : ""} onClick={() => setMoneda("VES")}>Bolívares</button>
          </div>
          <label className="lbl">{av ? "Efectivo que le entregas" : tipo === "INGRESO" ? "¿Cuánto entra?" : "¿Cuánto sale?"}
            <div className="inpw"><i>{moneda === "USD" ? "$" : "Bs"}</i><input autoFocus className="inp t" style={{ paddingLeft: moneda === "USD" ? 30 : 40 }} inputMode="decimal" placeholder="0,00"
              value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Monto del movimiento" /></div>
          </label>
          {av ? (
            <>
              <div className="lbl">¿Cómo te paga?
                <div className="seg cfg-seg">
                  {METODOS_AV.map(([id, n]) => <button key={id} className={metodo === id ? "on" : ""} onClick={() => setMetodo(id)}>{n}</button>)}
                </div>
              </div>
              <div className="two">
                <label className="lbl">Comisión %<input className="inp t" inputMode="decimal" value={pct} onChange={(e) => { setPct(e.target.value.replace(/[^\d.,]/g, "")); setCobradoTxt(""); }} aria-label="Comisión del avance" /></label>
                <label className="lbl">Le cobras (Bs)<input className="inp t" inputMode="decimal" placeholder={money(cobradoAuto)} value={cobradoTxt} onChange={(e) => setCobradoTxt(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Monto a cobrar por el avance" /></label>
              </div>
              {m > 0 && (
                <div className="mov-av">
                  <div><span>Pasa por {METODOS_AV.find((x) => x[0] === metodo)?.[1].toLowerCase()}</span><b className="t">Bs {money(cobrado)}</b></div>
                  <div><span>Le das en efectivo</span><b className="t">{fmt(moneda, m)}</b></div>
                  <div className={ganancia >= 0 ? "ok" : "bad"}><span>Tu ganancia</span><b className="t">Bs {money(ganancia)}</b></div>
                </div>
              )}
            </>
          ) : (
            <label className="lbl">{tipo === "INGRESO" ? "¿De dónde viene?" : "¿En qué se usó?"}
              <input className="inp" value={concepto} maxLength={200} onChange={(e) => setConcepto(e.target.value)} placeholder={PRESETS[tipo][0]} aria-label="Concepto del movimiento" />
              <div className="chips">{PRESETS[tipo].map((x) => <button key={x} className={"chip press" + (concepto === x ? " on" : "")} onClick={() => setConcepto(x)}>{x}</button>)}</div>
            </label>
          )}
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!listo} onClick={guardar}>{enviando ? "Guardando…" : "Registrar " + (av ? "avance" : TIPOS[tipo].n.toLowerCase())} <kbd className="kb">Enter</kbd></button></div>
      </div>
    </div>
  );
}
