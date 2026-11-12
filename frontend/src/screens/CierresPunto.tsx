import { useEffect, useState } from "react";
import { borrarCierrePunto, cierresPuntoDelTurno, cierresPuntoEntre, registrarCierrePunto, type CierrePunto, type CierrePuntoVista, type SeccionPunto } from "../api";
import { UIcono } from "../icons";
import { leerMonto } from "../arqueo";
import { centrar, fila, W } from "../ticket";

// Tickets de cierre del PUNTO DE VENTA / Biopago. El cajero copia el papel del banco al
// cerrar su caja (el papel se pierde); el dueño los ve todos por fecha en "Puntos".

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bs = (n: number) => "Bs " + money(n);
const numBanco = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // como el ticket: 29,983.00
const TIPO_N = { PUNTO: "Punto de venta", BIOPAGO: "Biopago" } as const;
const SECCIONES = [
  { k: "credito", n: "Tarjeta crédito", ticket: "TARJETA CREDITO", pre: "cred" },
  { k: "debito", n: "Tarjeta débito", ticket: "TARJETA DEBITO", pre: "deb" },
  { k: "masterVisa", n: "Debit Master/Visa", ticket: "DEBIT MASTER/VISA", pre: "mv" },
] as const;
type SecK = (typeof SECCIONES)[number]["k"];
type SecForm = { comprasN: string; compras: string; anulN: string; anul: string };
const vacia = (): SecForm => ({ comprasN: "", compras: "", anulN: "", anul: "" });
const ent = (s: string) => parseInt(s.replace(/\D/g, ""), 10) || 0;
const leerSec = (s: SecForm): SeccionPunto => ({ comprasN: ent(s.comprasN), compras: leerMonto(s.compras) ?? 0, anulN: ent(s.anulN), anul: leerMonto(s.anul) ?? 0 });
const totalSec = (s: SeccionPunto) => Math.round((s.compras - s.anul) * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const ahoraLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const diaLargo = (iso: string) => new Date(iso).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const horaCorta = (iso: string) => new Date(iso).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });

/** El ticket como lo imprime el banco (40 columnas), para verlo igual que el papel. */
export function textoTicketPunto(c: CierrePunto): string {
  const L = [centrar("CIERRE"), ...(c.titular ? [c.titular.toUpperCase().slice(0, W)] : [])];
  L.push(fila("AFIL:", c.afiliado || "—"), fila("LOTE CREDITO:", c.loteCredito || "—"), fila("LOTE DEBITO:", c.loteDebito || "—"),
    fila("LOTE MASTER/VISA:", c.loteMasterVisa || "—"));
  const d = new Date(c.fechaHora);
  L.push(fila("FECHA/HORA:", `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`));
  L.push("-".repeat(W), fila("TIPO           SUMA", "MONTO"));
  const v = c as unknown as Record<string, number>;
  for (const s of SECCIONES) {
    const cn = v[s.pre + "ComprasN"], cm = v[s.pre + "Compras"], an = v[s.pre + "AnulN"], am = v[s.pre + "Anul"];
    L.push(s.ticket, fila("COMPRA        " + String(cn).padStart(4), numBanco(cm)), fila("ANULACION     " + String(an).padStart(4), numBanco(am)),
      fila("TOTAL         " + String(cn - an).padStart(4), numBanco(cm - am)));
  }
  L.push("-".repeat(W), fila("TOTAL DEL CIERRE", numBanco(c.totalBs)));
  return L.join("\n");
}

/** Formulario que copia el ticket de cierre del punto (mismo orden que el papel). */
export function FormCierrePunto({ onClose, onGuardado }: { onClose: () => void; onGuardado: (c: CierrePunto) => void }) {
  const [tipo, setTipo] = useState<"PUNTO" | "BIOPAGO">("PUNTO");
  const recordado = (t: string) => { try { return JSON.parse(localStorage.getItem("kp_punto_" + t) || "{}"); } catch { return {}; } };
  const [titular, setTitular] = useState<string>(() => recordado("PUNTO").titular || "");
  const [afiliado, setAfiliado] = useState<string>(() => recordado("PUNTO").afiliado || "");
  const [lotes, setLotes] = useState({ credito: "", debito: "", mv: "" });
  const [fecha, setFecha] = useState(ahoraLocal);
  const [secs, setSecs] = useState<Record<SecK, SecForm>>({ credito: vacia(), debito: vacia(), masterVisa: vacia() });
  const [nota, setNota] = useState("");
  const [err, setErr] = useState("");
  const [enviando, setEnviando] = useState(false);
  const cambiarTipo = (t: "PUNTO" | "BIOPAGO") => { setTipo(t); const r = recordado(t); setTitular(r.titular || ""); setAfiliado(r.afiliado || ""); };
  // Casi siempre los tres lotes son el mismo número: el primero se copia a los otros mientras sean iguales.
  const loteCredito = (v: string) => setLotes((l) => ({ credito: v, debito: l.debito === l.credito ? v : l.debito, mv: l.mv === l.credito ? v : l.mv }));
  const setSec = (k: SecK, campo: keyof SecForm, v: string) => setSecs((s) => ({ ...s, [k]: { ...s[k], [campo]: v } }));
  const leidas = SECCIONES.map((s) => leerSec(secs[s.k]));
  const total = Math.round(leidas.reduce((a, s) => a + totalSec(s), 0) * 100) / 100;

  const guardar = async () => {
    if (enviando) return;
    if (leidas.every((s) => s.comprasN === 0 && s.compras === 0)) { setErr("Escribe las compras de al menos una sección del ticket"); return; }
    const malo = SECCIONES.find((_, i) => leidas[i].anul > leidas[i].compras);
    if (malo) { setErr(malo.n + ": las anulaciones no pueden pasar de las compras"); return; }
    setEnviando(true); setErr("");
    try {
      const c = await registrarCierrePunto({
        tipo, titular: titular.trim() || undefined, afiliado: afiliado.trim() || undefined,
        loteCredito: lotes.credito.trim() || undefined, loteDebito: lotes.debito.trim() || undefined, loteMasterVisa: lotes.mv.trim() || undefined,
        fechaHora: new Date(fecha).toISOString(), credito: leidas[0], debito: leidas[1], masterVisa: leidas[2], nota: nota.trim() || undefined,
      });
      try { localStorage.setItem("kp_punto_" + tipo, JSON.stringify({ titular: titular.trim(), afiliado: afiliado.trim() })); } catch { /* sin espacio */ }
      onGuardado(c);
    } catch (e) { setErr((e as Error).message); }
    finally { setEnviando(false); }
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card cp-form" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
        <div className="modal-head"><h2>Ticket de cierre del punto</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">Copia el ticket que imprime el punto al cerrar el lote, tal como sale en el papel.</span>
          <div className="seg" role="tablist" aria-label="Tipo de equipo">
            {(["PUNTO", "BIOPAGO"] as const).map((t) => <button key={t} role="tab" aria-selected={tipo === t} className={tipo === t ? "on" : ""} onClick={() => cambiarTipo(t)}>{t === "PUNTO" ? "Punto" : "Biopago"}</button>)}
          </div>
          <label className="lbl">Comercio <span className="opt">(la línea de arriba del ticket)</span>
            <input className="inp" value={titular} maxLength={80} onChange={(e) => setTitular(e.target.value.toUpperCase())} placeholder="Ej.: EPN DIEGO HERNANDEZ CRE" aria-label="Comercio" />
          </label>
          <div className="two cp-two">
            <label className="lbl">Afiliado<input className="inp t" inputMode="numeric" value={afiliado} maxLength={30} onChange={(e) => setAfiliado(e.target.value)} placeholder="0078847603" aria-label="Afiliado" /></label>
            <label className="lbl">Fecha y hora del ticket<input className="inp t" type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha y hora del ticket" /></label>
          </div>
          <div className="cp-lotes">
            <label className="lbl">Lote crédito<input className="inp t" inputMode="numeric" value={lotes.credito} maxLength={20} onChange={(e) => loteCredito(e.target.value)} placeholder="000407" aria-label="Lote crédito" /></label>
            <label className="lbl">Lote débito<input className="inp t" inputMode="numeric" value={lotes.debito} maxLength={20} onChange={(e) => setLotes({ ...lotes, debito: e.target.value })} placeholder="000407" aria-label="Lote débito" /></label>
            <label className="lbl">Lote Master/Visa<input className="inp t" inputMode="numeric" value={lotes.mv} maxLength={20} onChange={(e) => setLotes({ ...lotes, mv: e.target.value })} placeholder="000407" aria-label="Lote Master/Visa" /></label>
          </div>
          {SECCIONES.map((s, i) => (
            <div className="cp-sec" key={s.k}>
              <div className="cp-sec-h"><b>{s.n}</b><span className="t">Total {bs(totalSec(leidas[i]))}</span></div>
              <div className="cp-grid">
                <span />
                <span className="cp-th">Suma</span>
                <span className="cp-th">Monto (Bs)</span>
                <span className="cp-rl">Compra</span>
                <input className="inp t" inputMode="numeric" value={secs[s.k].comprasN} placeholder="0" onChange={(e) => setSec(s.k, "comprasN", e.target.value.replace(/\D/g, ""))} aria-label={s.n + ": cantidad de compras"} />
                <input className="inp t" inputMode="decimal" value={secs[s.k].compras} placeholder="0,00" onChange={(e) => setSec(s.k, "compras", e.target.value.replace(/[^\d.,]/g, ""))} aria-label={s.n + ": monto de compras"} />
                <span className="cp-rl">Anulación</span>
                <input className="inp t" inputMode="numeric" value={secs[s.k].anulN} placeholder="0" onChange={(e) => setSec(s.k, "anulN", e.target.value.replace(/\D/g, ""))} aria-label={s.n + ": cantidad de anulaciones"} />
                <input className="inp t" inputMode="decimal" value={secs[s.k].anul} placeholder="0,00" onChange={(e) => setSec(s.k, "anul", e.target.value.replace(/[^\d.,]/g, ""))} aria-label={s.n + ": monto de anulaciones"} />
              </div>
            </div>
          ))}
          <label className="lbl">Nota <span className="opt">(opcional)</span><input className="inp" value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: el punto se quedó sin papel" aria-label="Nota del cierre de punto" /></label>
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="modal-foot cp-foot">
          <div className="cp-total"><span>Total del ticket</span><b className="t">{bs(total)}</b></div>
          <button className="btn primary big press" disabled={enviando} onClick={guardar}>{enviando ? "Guardando…" : "Guardar ticket"}</button>
        </div>
      </div>
    </div>
  );
}

/** En el Cierre de caja: los tickets del punto anotados en este turno. Avisa los totales por tipo. */
export function CierresPuntoTurno({ turnoId, onTotales }: { turnoId: number; onTotales: (t: Record<string, { total: number; n: number }>) => void }) {
  const [lista, setLista] = useState<CierrePunto[]>([]);
  const [form, setForm] = useState(false);
  const [ver, setVer] = useState<CierrePunto | null>(null);
  const [err, setErr] = useState("");
  const avisar = (l: CierrePunto[]) => {
    const t: Record<string, { total: number; n: number }> = {};
    for (const c of l) { const x = (t[c.tipo] ??= { total: 0, n: 0 }); x.total = Math.round((x.total + c.totalBs) * 100) / 100; x.n++; }
    onTotales(t);
  };
  const cargar = () => cierresPuntoDelTurno(turnoId).then((l) => { setLista(l); avisar(l); setErr(""); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { cargar(); }, [turnoId]);
  const borrar = async (c: CierrePunto) => {
    if (!window.confirm("¿Borrar este ticket de cierre del punto?")) return;
    try { await borrarCierrePunto(c.id); await cargar(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="card cp-turno">
      <div className="arq-head">
        <div><h3 className="h3">Tickets de cierre del punto</h3><span className="hint">Copia aquí el ticket que imprime el punto (y el Biopago) al cerrar el lote. El papel se puede perder; esto queda guardado para el dueño.</span></div>
        <button className="btn primary press" onClick={() => setForm(true)}><UIcono k="plus" sw={2.2} />Anotar ticket del punto</button>
      </div>
      {lista.length === 0 && <span className="hint cp-vacio">Todavía no has anotado ningún ticket de cierre del punto en este turno.</span>}
      <div className="cp-lista">
        {lista.map((c) => (
          <div className="cp-fila" key={c.id}>
            <span className="co2-ic"><UIcono k={c.tipo === "BIOPAGO" ? "finger" : "card"} sw={1.8} /></span>
            <button className="cp-fila-tx press" onClick={() => setVer(c)}>
              <b>{TIPO_N[c.tipo]}{c.titular ? " · " + c.titular : ""}</b>
              <small>{horaCorta(c.fechaHora)} · lote {c.loteDebito || c.loteCredito || "—"} · {c.debComprasN + c.credComprasN + c.mvComprasN} compras</small>
            </button>
            <b className="t">{bs(c.totalBs)}</b>
            <button className="ghost press cp-x" aria-label="Borrar ticket del punto" onClick={() => borrar(c)}><UIcono k="close" sw={2} /></button>
          </div>
        ))}
      </div>
      {err && <p className="pinmsg err">{err}</p>}
      {form && <FormCierrePunto onClose={() => setForm(false)} onGuardado={() => { setForm(false); cargar(); }} />}
      {ver && <VerTicket c={ver} onClose={() => setVer(null)} />}
    </div>
  );
}

function VerTicket({ c, onClose }: { c: CierrePunto; onClose: () => void }) {
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>{TIPO_N[c.tipo]}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body"><pre className="cp-papel t" aria-label="Ticket del punto">{textoTicketPunto(c)}</pre>{c.nota && <span className="hint">Nota: {c.nota}</span>}</div>
      </div>
    </div>
  );
}

// ---------- Panel del dueño ----------
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const RANGOS = [
  { id: "hoy", n: "Hoy", r: () => { const h = new Date(); return [iso(h), iso(h)]; } },
  { id: "ayer", n: "Ayer", r: () => { const a = new Date(); a.setDate(a.getDate() - 1); return [iso(a), iso(a)]; } },
  { id: "7", n: "7 días", r: () => { const h = new Date(), d = new Date(); d.setDate(d.getDate() - 6); return [iso(d), iso(h)]; } },
  { id: "mes", n: "Este mes", r: () => { const h = new Date(); return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)]; } },
] as const;

export function PanelCierresPunto() {
  const [rango, setRango] = useState<string>("7");
  const [dia, setDia] = useState(iso(new Date()));
  const [lista, setLista] = useState<CierrePuntoVista[] | null>(null);
  const [err, setErr] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const [desde, hasta] = rango === "dia" ? [dia, dia] : RANGOS.find((r) => r.id === rango)!.r();
  const cargar = () => cierresPuntoEntre(desde, hasta).then((l) => { setLista(l); setErr(""); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { setLista(null); cargar(); }, [desde, hasta]);
  const borrar = async (c: CierrePunto) => {
    if (!window.confirm("¿Borrar este ticket de cierre del punto? No se puede deshacer.")) return;
    try { await borrarCierrePunto(c.id); await cargar(); } catch (e) { setErr((e as Error).message); }
  };
  const total = (lista || []).reduce((s, v) => s + v.cierre.totalBs, 0);
  const porDia = new Map<string, CierrePuntoVista[]>();
  for (const v of lista || []) { const k = iso(new Date(v.cierre.fechaHora)); porDia.set(k, [...(porDia.get(k) || []), v]); }

  return (
    <div className="caja"><div className="scroll pad cp-panel">
      <div className="cli-head"><div><h2>Cierres de punto</h2><p>Los tickets de cierre del punto y del Biopago que anotan tus cajeros, con fecha, día y hora.</p></div></div>
      <div className="cp-filtros">
        <div className="seg cp-rangos" role="tablist" aria-label="Rango de fechas">
          {RANGOS.map((r) => <button key={r.id} role="tab" aria-selected={rango === r.id} className={rango === r.id ? "on" : ""} onClick={() => setRango(r.id)}>{r.n}</button>)}
        </div>
        <label className="cp-dia"><span>Un día:</span><input className="inp t" type="date" value={dia} max={iso(new Date())} onChange={(e) => { setDia(e.target.value); setRango("dia"); }} aria-label="Ver un día" /></label>
      </div>
      <div className="inv-stats">
        <div className="inv-stat"><span className="ibox" style={{ background: "var(--accent-soft)", color: "var(--warn)" }}><UIcono k="card" /></span>
          <div><span className="k">Tickets</span><span className="v t">{lista ? lista.length : "…"}</span><span className="d">{desde === hasta ? diaLargo(desde + "T12:00:00") : desde.split("-").reverse().join("/") + " al " + hasta.split("-").reverse().join("/")}</span></div></div>
        <div className="inv-stat"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="cash" /></span>
          <div><span className="k">Total de los tickets</span><span className="v t">{bs(total)}</span><span className="d">compras − anulaciones</span></div></div>
      </div>
      {err && <p className="pinmsg err">{err}</p>}
      {lista && lista.length === 0 && <p className="noresult">No hay tickets de cierre del punto en estas fechas.</p>}
      {[...porDia.entries()].map(([d, vs]) => (
        <section key={d} className="cp-dia-grupo">
          <h3 className="h3 cp-dia-t"><span className="cp-dia-n">{diaLargo(d + "T12:00:00")}</span> <span className="t">{bs(vs.reduce((s, v) => s + v.cierre.totalBs, 0))}</span></h3>
          <div className="cp-cards">
            {vs.map((v) => {
              const c = v.cierre;
              const dif = v.sistemaBs == null ? null : Math.round((c.totalBs - v.sistemaBs) * 100) / 100;
              const ab = abierto === c.id;
              return (
                <div className="card cp-card" key={c.id}>
                  <button className="cp-card-h press" onClick={() => setAbierto(ab ? null : c.id)} aria-expanded={ab}>
                    <span className="co2-ic"><UIcono k={c.tipo === "BIOPAGO" ? "finger" : "card"} sw={1.8} /></span>
                    <span className="cp-card-tx"><b>{c.titular || TIPO_N[c.tipo]}</b>
                      <small>{TIPO_N[c.tipo]} · {horaCorta(c.fechaHora)} · {v.caja || "Sin caja"}{v.cajero ? " · " + v.cajero : ""}</small></span>
                    <span className="cp-card-m"><b className="t">{bs(c.totalBs)}</b>
                      {dif != null && <small className={dif === 0 ? "mg-ok" : "mg-bad"}>{dif === 0 ? "Cuadra con el sistema" : (dif > 0 ? "Ticket +" : "Ticket −") + bs(Math.abs(dif)) + " vs sistema"}</small>}</span>
                  </button>
                  {ab && (
                    <div className="cp-card-b">
                      <pre className="cp-papel t" aria-label="Ticket del punto">{textoTicketPunto(c)}</pre>
                      <div className="cp-meta">
                        <div><span className="k">Día</span><b>{diaLargo(c.fechaHora)}</b></div>
                        <div><span className="k">Hora del ticket</span><b>{horaCorta(c.fechaHora)}</b></div>
                        <div><span className="k">Anotado</span><b>{new Date(c.createdAt).toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</b></div>
                        {v.sistemaBs != null && <div><span className="k">Sistema ({TIPO_N[c.tipo]}) en ese turno</span><b className="t">{bs(v.sistemaBs)}</b></div>}
                        {c.nota && <div><span className="k">Nota</span><b>{c.nota}</b></div>}
                        <button className="btn2 press cp-borrar" onClick={() => borrar(c)}><UIcono k="close" sw={2} />Borrar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div></div>
  );
}
