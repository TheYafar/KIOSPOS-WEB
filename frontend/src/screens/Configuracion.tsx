import { useEffect, useRef, useState } from "react";
import { UIcono } from "../icons";
import { putCajaConfig } from "../api";
import { getSesion } from "../session";
import { aServidor, aplicarDelServidor, bcvActualizada, getBcv, getConfig, setConfig, tasaEfectiva, type ConfigCaja, type MetodoExtra, type MetodoId, type TasaModo } from "../config";

// Configuración del NEGOCIO: formas de pago activas y tasa del dólar con la que se cobra.
// Vive en el servidor y la comparten todas las cajas. Solo el dueño o el encargado la
// cambian; el cajero la ve (y la caja guarda una copia para cobrar sin internet).

const METODOS: { id: MetodoId; n: string; sub: string; icon: string; color: string }[] = [
  { id: "EFECTIVO_USD", n: "Efectivo $", sub: "Billetes en dólares", icon: "cash", color: "var(--primary)" },
  { id: "EFECTIVO_BS", n: "Efectivo Bs", sub: "Billetes en bolívares", icon: "bills", color: "var(--c-limpieza)" },
  { id: "PAGO_MOVIL", n: "Pago móvil", sub: "Transferencia inmediata", icon: "phone", color: "var(--c-bebidas)" },
  { id: "PUNTO", n: "Punto de venta", sub: "Tarjeta de débito", icon: "card", color: "var(--warn)" },
  { id: "BIOPAGO", n: "Biopago", sub: "Huella (BDV)", icon: "finger", color: "var(--c-chucherias)" },
  { id: "FIADO", n: "Crédito", sub: "Anotar en la cuenta del cliente", icon: "user", color: "var(--c-charcuteria)" },
];

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const leer = (s: string) => { const t = s.trim(); if (!t) return 0; const n = parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); return isNaN(n) ? 0 : n; };

export function Configuracion() {
  const [c, setC] = useState<ConfigCaja>(getConfig());
  const [ajTxt, setAjTxt] = useState(c.ajuste ? String(c.ajuste).replace(".", ",") : "");
  const [manTxt, setManTxt] = useState(c.tasaManual ? String(c.tasaManual).replace(".", ",") : "");
  const [msg, setMsg] = useState("");
  const rol = getSesion()?.rol;
  const puede = rol === "DUENO" || rol === "ENCARGADO";
  const pendiente = useRef<number | undefined>(undefined);
  const version = useRef(0);
  // Si llega una versión nueva del servidor (otra caja o el dueño la cambió), se refleja aquí.
  useEffect(() => {
    const on = () => {
      if (pendiente.current !== undefined) return; // hay cambios propios sin guardar todavía
      const n = getConfig();
      setC(n);
      setAjTxt(n.ajuste ? String(n.ajuste).replace(".", ",") : "");
      setManTxt(n.tasaManual ? String(n.tasaManual).replace(".", ",") : "");
    };
    window.addEventListener("kp-config", on);
    return () => { window.removeEventListener("kp-config", on); window.clearTimeout(pendiente.current); };
  }, []);
  const [nx, setNx] = useState<{ nombre: string; tipo: MetodoExtra["tipo"]; simbolo: string; tasa: string }>({ nombre: "", tipo: "USD", simbolo: "", tasa: "" });
  const bcv = getBcv();
  const bcvAt = bcvActualizada();
  const agregarExtra = () => {
    const nombre = nx.nombre.trim();
    if (!nombre) { setMsg("Escribe el nombre (ej. Zelle, Binance, Euros)"); return; }
    if (nx.tipo === "OTRA" && (!nx.simbolo.trim() || leer(nx.tasa) <= 0)) { setMsg("Para otra moneda pon su símbolo y cuántos $ vale 1"); return; }
    const x: MetodoExtra = { id: Date.now().toString(36), nombre, tipo: nx.tipo, simbolo: nx.simbolo.trim().slice(0, 6), tasaUsd: leer(nx.tasa), activo: true };
    guardar({ ...c, extras: [...c.extras, x] });
    setNx({ nombre: "", tipo: "USD", simbolo: "", tasa: "" });
  };
  const cambiarExtra = (id: string, cambio: Partial<MetodoExtra>) => guardar({ ...c, extras: c.extras.map((x) => (x.id === id ? { ...x, ...cambio } : x)) });
  const borrarExtra = (id: string) => guardar({ ...c, extras: c.extras.filter((x) => x.id !== id) });

  // Aplica al instante en este equipo y se guarda en el servidor (con una pausa corta
  // para no mandar una petición por cada tecla).
  const guardar = (n: ConfigCaja) => {
    if (!puede) return;
    const mio = ++version.current;
    window.clearTimeout(pendiente.current);
    pendiente.current = -1; // marca "hay cambios propios" antes de avisar (no pisar lo que se escribe)
    setC(n); setConfig(n); setMsg("Guardando…");
    pendiente.current = window.setTimeout(() => {
      putCajaConfig(aServidor(n))
        .then((r) => {
          if (mio !== version.current) return; // ya hay un cambio más nuevo en camino
          pendiente.current = undefined; aplicarDelServidor(r); setMsg("Guardado ✓"); window.setTimeout(() => setMsg(""), 1800);
        })
        .catch((e) => { if (mio === version.current) { pendiente.current = undefined; setMsg("No se guardó: " + (e instanceof Error ? e.message : "sin conexión")); } });
    }, 500);
  };
  const activas = METODOS.filter((m) => m.id !== "FIADO" && c.metodos[m.id]).length;
  const toggle = (id: MetodoId) => {
    if (id !== "FIADO" && c.metodos[id] && activas === 1) { setMsg("Debe quedar al menos una forma de pago activa"); return; }
    guardar({ ...c, metodos: { ...c.metodos, [id]: !c.metodos[id] } });
  };
  const modo = (m: TasaModo) => guardar({ ...c, tasaModo: m });

  const efectiva = tasaEfectiva(bcv, c);
  const dif = bcv > 0 ? efectiva - bcv : 0;

  return (
    <div className="caja">
      <div className="scroll pad cfg">
        <div className="cfg-head"><div><h2>Configuración</h2><p>{puede ? "Aplica al instante en todas las cajas del negocio." : "La configura el dueño o el encargado. Aquí puedes verla."}</p></div>{msg && <span className={"pill " + (msg.startsWith("Guardado") ? "ok" : msg.startsWith("Guardando") ? "info" : "late")}>{msg}</span>}</div>
        {!puede && <div className="cfg-ro" role="note"><UIcono k="lock" sw={2} />Solo lectura: pide al dueño o encargado que cambie las formas de pago o la tasa.</div>}
        <fieldset className="cfg-grid cfg-fs" disabled={!puede}>
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

            <h3 className="h3 cfg-sub">Otras monedas y formas de pago</h3>
            <p className="hint">Agrega con qué más cobras: Zelle, Binance, euros, pesos… Aparecen al cobrar en todas las cajas.</p>
            {c.extras.length > 0 && (
              <div className="cfg-list">
                {c.extras.map((x) => (
                  <div key={x.id} className="cfg-row cfg-xrow" aria-checked={x.activo}>
                    <span className="co2-ic" style={{ background: "color-mix(in srgb, var(--c-charcuteria) 15%, var(--surface))", color: "var(--c-charcuteria)" }}><UIcono k={x.tipo === "VES" ? "bills" : "cash"} sw={1.8} /></span>
                    <span className="cfg-tx"><b>{x.nombre}</b><small>{x.tipo === "USD" ? "Se cobra en dólares" : x.tipo === "VES" ? "Se cobra en bolívares" : `Otra moneda · 1 ${x.simbolo} = $ ${money(x.tasaUsd)}`}</small></span>
                    {x.tipo === "OTRA" && (
                      <input className="inp t cfg-xtasa" inputMode="decimal" defaultValue={String(x.tasaUsd).replace(".", ",")} aria-label={"Tasa de " + x.nombre}
                        onBlur={(e) => { const v = leer(e.target.value); if (v > 0) cambiarExtra(x.id, { tasaUsd: v }); }} title="Cuántos $ vale 1 unidad" />
                    )}
                    <button className={"sw" + (x.activo ? " on" : "")} role="switch" aria-checked={x.activo} aria-label={"Activar " + x.nombre} onClick={() => cambiarExtra(x.id, { activo: !x.activo })}><i /></button>
                    <button className="hdel" aria-label={"Borrar " + x.nombre} onClick={() => borrarExtra(x.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {puede && <div className="cfg-add">
              <input className="inp" placeholder="Nombre (ej. Zelle)" value={nx.nombre} onChange={(e) => setNx({ ...nx, nombre: e.target.value })} aria-label="Nombre de la forma de pago"
                onKeyDown={(e) => { if (e.key === "Enter") agregarExtra(); }} />
              <div className="seg cfg-tipo">
                {([["USD", "En $"], ["VES", "En Bs"], ["OTRA", "Otra moneda"]] as const).map(([t, n]) => (
                  <button key={t} className={nx.tipo === t ? "on" : ""} onClick={() => setNx({ ...nx, tipo: t })}>{n}</button>
                ))}
              </div>
              {nx.tipo === "OTRA" && (
                <div className="cfg-ajrow">
                  <input className="inp" placeholder="Símbolo (ej. €, COP)" value={nx.simbolo} onChange={(e) => setNx({ ...nx, simbolo: e.target.value })} aria-label="Símbolo de la moneda" />
                  <input className="inp t" inputMode="decimal" placeholder="1 = $ ?" value={nx.tasa} onChange={(e) => setNx({ ...nx, tasa: e.target.value.replace(/[^\d.,]/g, "") })} aria-label="Cuántos dólares vale 1 unidad" />
                </div>
              )}
              <button className="btn primary press" onClick={agregarExtra}><UIcono k="plus" sw={2.2} />Agregar forma de pago</button>
            </div>}
            {!puede && c.extras.length === 0 && <p className="hint">No hay otras formas de pago.</p>}
          </section>

          <section className="card cfg-sec">
            <h3 className="h3">Tasa del dólar</h3>
            <div className="cfg-bcv">
              <span>{bcvAt ? "Tasa BCV de hoy" : "Última tasa conocida"} <small>{bcvAt ? "se actualiza sola, 24/7 · " + bcvAt.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" }) : "no se pudo traer la BCV ahora; se reintenta sola"}</small></span>
              <b className="t">{bcv > 0 ? "Bs " + money(bcv) : "—"}</b>
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
        </fieldset>
      </div>
    </div>
  );
}
