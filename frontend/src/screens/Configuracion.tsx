import { useState } from "react";
import { UIcono } from "../icons";
import { getBcv, getConfig, setConfig, tasaEfectiva, type ConfigCaja, type MetodoId, type TasaModo } from "../config";

// Configuración (por ahora): formas de pago activas y tasa del dólar con la que se cobra.
// Se guarda en este equipo y aplica al instante.

const METODOS: { id: MetodoId; n: string; sub: string; icon: string; color: string }[] = [
  { id: "EFECTIVO_USD", n: "Efectivo $", sub: "Billetes en dólares", icon: "cash", color: "var(--primary)" },
  { id: "EFECTIVO_BS", n: "Efectivo Bs", sub: "Billetes en bolívares", icon: "bills", color: "var(--c-limpieza)" },
  { id: "PAGO_MOVIL", n: "Pago móvil", sub: "Transferencia inmediata", icon: "phone", color: "var(--c-bebidas)" },
  { id: "PUNTO", n: "Punto de venta", sub: "Tarjeta de débito", icon: "card", color: "var(--warn)" },
  { id: "BIOPAGO", n: "Biopago", sub: "Huella (BDV)", icon: "finger", color: "var(--c-chucherias)" },
];

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const leer = (s: string) => { const t = s.trim(); if (!t) return 0; const n = parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return isNaN(n) ? 0 : n; };

export function Configuracion() {
  const [c, setC] = useState<ConfigCaja>(getConfig());
  const [ajTxt, setAjTxt] = useState(c.ajuste ? String(c.ajuste).replace(".", ",") : "");
  const [manTxt, setManTxt] = useState(c.tasaManual ? String(c.tasaManual).replace(".", ",") : "");
  const [msg, setMsg] = useState("");
  const bcv = getBcv();

  const guardar = (n: ConfigCaja) => { setC(n); setConfig(n); setMsg("Guardado ✓"); window.setTimeout(() => setMsg(""), 1800); };
  const activas = METODOS.filter((m) => c.metodos[m.id]).length;
  const toggle = (id: MetodoId) => {
    if (c.metodos[id] && activas === 1) { setMsg("Debe quedar al menos una forma de pago activa"); return; }
    guardar({ ...c, metodos: { ...c.metodos, [id]: !c.metodos[id] } });
  };
  const modo = (m: TasaModo) => guardar({ ...c, tasaModo: m });

  const efectiva = tasaEfectiva(bcv, c);
  const dif = bcv > 0 ? efectiva - bcv : 0;

  return (
    <div className="caja">
      <div className="scroll pad cfg">
        <div className="cfg-head"><div><h2>Configuración</h2><p>Se guarda en este equipo y aplica al instante.</p></div>{msg && <span className={"pill " + (msg.startsWith("Guardado") ? "ok" : "late")}>{msg}</span>}</div>
        <div className="cfg-grid">
          <section className="card cfg-sec">
            <h3 className="h3">Formas de pago</h3>
            <p className="hint">Las que apagues no aparecen al cobrar ni en la barra de montos. Si una apagada tiene dinero en el turno, igual sale en el cierre.</p>
            <div className="cfg-list">
              {METODOS.map((m) => (
                <button key={m.id} className="cfg-row press" role="switch" aria-checked={c.metodos[m.id]} onClick={() => toggle(m.id)}>
                  <span className="co2-ic" style={{ background: `color-mix(in srgb, ${m.color} 15%, var(--surface))`, color: m.color }}><UIcono k={m.icon} sw={1.8} /></span>
                  <span className="cfg-tx"><b>{m.n}</b><small>{m.sub}</small></span>
                  <span className={"sw" + (c.metodos[m.id] ? " on" : "")}><i /></span>
                </button>
              ))}
            </div>
          </section>

          <section className="card cfg-sec">
            <h3 className="h3">Tasa del dólar</h3>
            <div className="cfg-bcv">
              <span>Tasa BCV de hoy <small>se actualiza sola, 24/7</small></span>
              <b className="t">{bcv > 0 ? "Bs " + money(bcv) : "Sin conexión"}</b>
            </div>
            <div className="seg cfg-seg" role="tablist">
              <button className={c.tasaModo === "bcv" ? "on" : ""} onClick={() => modo("bcv")}>Usar la BCV</button>
              <button className={c.tasaModo === "ajuste" ? "on" : ""} onClick={() => modo("ajuste")}>BCV + aumento</button>
              <button className={c.tasaModo === "manual" ? "on" : ""} onClick={() => modo("manual")}>Tasa fija</button>
            </div>

            {c.tasaModo === "ajuste" && (
              <div className="cfg-aj">
                <label className="lbl">¿Cuánto le sumas a la BCV?
                  <div className="cfg-ajrow">
                    <input className="inp t" inputMode="decimal" placeholder="0" value={ajTxt}
                      onChange={(e) => { const v = e.target.value.replace(/[^\d.,]/g, ""); setAjTxt(v); guardar({ ...c, ajuste: leer(v) }); }} aria-label="Aumento sobre la BCV" />
                    <div className="seg cfg-unit">
                      <button className={c.ajusteTipo === "pct" ? "on" : ""} onClick={() => guardar({ ...c, ajusteTipo: "pct" })}>%</button>
                      <button className={c.ajusteTipo === "bs" ? "on" : ""} onClick={() => guardar({ ...c, ajusteTipo: "bs" })}>Bs</button>
                    </div>
                  </div>
                </label>
              </div>
            )}
            {c.tasaModo === "manual" && (
              <label className="lbl">Tasa fija (Bs por cada $1)
                <input className="inp t" inputMode="decimal" placeholder={bcv ? String(bcv) : "Ej: 900"} value={manTxt}
                  onChange={(e) => { const v = e.target.value.replace(/[^\d.,]/g, ""); setManTxt(v); guardar({ ...c, tasaManual: leer(v) }); }} aria-label="Tasa fija" />
                <span className="hint">Con tasa fija no se usa la BCV automática hasta que vuelvas a “Usar la BCV”.</span>
              </label>
            )}

            <div className="cfg-prev">
              <span>Vas a cobrar a</span>
              <b className="t">{efectiva > 0 ? "Bs " + money(efectiva) : "—"} <small>por cada $1</small></b>
              {dif !== 0 && <span className={"pill " + (dif > 0 ? "soon" : "info")}>{dif > 0 ? "+" : "−"}Bs {money(Math.abs(dif))} ({((dif / bcv) * 100).toFixed(1).replace(".", ",")}%) {dif > 0 ? "sobre" : "bajo"} la BCV</span>}
            </div>
            {efectiva > 0 && (
              <div className="cfg-ej">
                {[1, 5, 10, 20, 50].map((d) => <div key={d}><span>$ {d}</span><b className="t">Bs {money(d * efectiva)}</b></div>)}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
