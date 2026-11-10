import { useEffect, useState } from "react";
import { admin2fa, adminAprobarPago, adminCrearNegocio, adminEnlaceClave, adminNegocios, adminPagosPendientes, adminReactivar, adminRegistrarPago, adminSuspender, type NegocioVista, type PagoPendiente } from "../api";
import { UIcono } from "../icons";
import { HorariosCierre } from "./negocio";
import { TemaBtn } from "../TemaBtn";
import { Seguridad2fa } from "./Seguridad2fa";

const usd = (n: number | string) => "$ " + Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pillCls: Record<string, string> = { ACTIVA: "ok", AVISO: "soon", SUSPENDIDA: "late" };
const AV = ["var(--c-bebidas)", "var(--c-limpieza)", "var(--c-chucherias)", "var(--c-viveres)", "var(--c-charcuteria)", "var(--c-panaderia)"];

const FILTROS: { id: string; n: string }[] = [
  { id: "", n: "Todos" }, { id: "ACTIVA", n: "Activos" }, { id: "AVISO", n: "En aviso" }, { id: "SUSPENDIDA", n: "Suspendidos" },
];

/** Fecha ISO → "hoy / ayer / hace N días" para "última vez en línea". */
function desde(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return "hace " + dias + " días";
  return d.toLocaleDateString("es-VE", { day: "numeric", month: "short" });
}

export function SuperAdmin({ onSalir }: { onSalir: () => void }) {
  const [negs, setNegs] = useState<NegocioVista[]>([]);
  const [pagos, setPagos] = useState<PagoPendiente[]>([]);
  const [modal, setModal] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("");
  const [pagoNeg, setPagoNeg] = useState<NegocioVista | null>(null);
  const [seg, setSeg] = useState(false);
  const [con2fa, setCon2fa] = useState<boolean | null>(null);
  const [enlace, setEnlace] = useState<{ neg: string; url: string } | null>(null);
  useEffect(() => { admin2fa().then((r) => setCon2fa(r.activo)).catch(() => {}); }, []);
  const pedirEnlace = async (n: NegocioVista) => {
    try { setEnlace({ neg: n.situacion.nombre, url: await adminEnlaceClave(n.situacion.negocioId) }); }
    catch (e) { setErr((e as Error).message); }
  };

  const cargar = async () => {
    try { setNegs(await adminNegocios()); setPagos(await adminPagosPendientes()); setErr(""); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { cargar(); }, []);

  const accion = async (fn: () => Promise<void>, ok: string) => { try { await fn(); setMsg(ok); cargar(); } catch (e) { setErr((e as Error).message); } };

  const activos = negs.filter((n) => n.situacion.estadoEfectivo === "ACTIVA").length;
  const deuda = negs.reduce((s, n) => s + n.situacion.deuda, 0);
  const qn = q.trim().toLowerCase();
  const lista = negs.filter((n) =>
    (!filtro || n.situacion.estadoEfectivo === filtro) &&
    (!qn || n.situacion.nombre.toLowerCase().includes(qn)));

  return (
    <div className="app">
      <div className="shell">
        <nav className="rail" aria-label="Menú">
          <span className="logo">K</span>
          <span className="rail-sp" />
          <button className="rail-item" onClick={onSalir}><UIcono k="user" />Salir</button>
          <span className="rail-av" style={{ ["--av" as string]: "var(--c-charcuteria)" }}>U</span>
        </nav>
        <div className="appmain">
          <header className="hdr">
            <div><h1>Administración</h1><div className="sub">Super admin · uriel</div></div>
            <div className="hpills"><TemaBtn />
              <button className={"btn press " + (con2fa === false ? "warn-btn" : "ghost")} onClick={() => setSeg(true)}><UIcono k="lock" sw={2} />Seguridad</button>
              <button className="btn primary press" onClick={() => setModal(true)}><UIcono k="plus" sw={2.2} />Nuevo negocio</button></div>
          </header>
          <div className="caja">
            <div className="scroll pad">
              {msg && <span className="pill ok" style={{ alignSelf: "flex-start" }}><UIcono k="check" sw={2.5} />{msg}</span>}
              <div className="inv-stats">
                <div className="inv-stat"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="store" /></span>
                  <div><span className="k">Negocios</span><span className="v t">{negs.length}</span></div></div>
                <div className="inv-stat"><span className="ibox" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}><UIcono k="check" /></span>
                  <div><span className="k">Activos</span><span className="v t" style={{ color: "var(--ok)" }}>{activos}</span></div></div>
                <div className="inv-stat"><span className="ibox" style={{ background: "var(--accent-soft)", color: "var(--warn)" }}><UIcono k="cash" /></span>
                  <div><span className="k">Por cobrar</span><span className="v t">{usd(deuda)}</span><span className="d">deuda acumulada</span></div></div>
              </div>
              {con2fa === false && (
                <button className="sec-aviso" onClick={() => setSeg(true)}>
                  <UIcono k="alert" sw={2} /><span><b>Activa la verificación en dos pasos.</b> Si alguien saca tu clave, sin el código de tu teléfono no entra.</span>
                </button>
              )}
              {err && <p className="noresult">{err}</p>}

              {pagos.length > 0 && (
                <div className="card" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <h3>Pagos por aprobar <span className="cuenta">{pagos.length}</span></h3>
                  {pagos.map((p) => (
                    <div className="pago-row" key={p.id}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <b>Negocio #{p.negocioId}</b>
                        <div className="d">{usd(p.monto)} · {p.metodo}{p.referencia ? " · " + p.referencia : ""} · {p.meses} mes(es)</div>
                      </div>
                      <button className="btn primary press" onClick={() => accion(() => adminAprobarPago(p.id), "Pago aprobado")}>Aprobar</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="adm-bar">
                <label className="search">
                  <UIcono k="search" sw={2} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar negocio…" aria-label="Buscar negocio" />
                </label>
                <div className="admf">
                  {FILTROS.map((f) => (
                    <button key={f.id} className={"b" + (filtro === f.id ? " on" : "")} onClick={() => setFiltro(f.id)}>{f.n}</button>
                  ))}
                </div>
              </div>

              <div className="neg-grid">
                {lista.map((n, i) => {
                  const s = n.situacion;
                  return (
                    <div className="card neg" key={s.negocioId}>
                      <div className="neg-top">
                        <span className="neg-av" style={{ ["--av" as string]: AV[i % AV.length] }}>{(s.nombre.charAt(0) || "·").toUpperCase()}</span>
                        <div className="grow" style={{ minWidth: 0 }}><b>{s.nombre}</b><div className="d">Plan {s.plan} · {n.cajas} caja(s)</div></div>
                        <span className={"pill " + (pillCls[s.estadoEfectivo] || "late")}><i />{s.estadoEfectivo}</span>
                      </div>
                      <div className="neg-data">
                        <div className="nd"><span className="k">Pagó hasta</span><b>{s.pagoHasta || "—"}</b></div>
                        <div className="nd"><span className="k">Deuda</span>{s.mesesPendientes > 0 ? <b className="mg-bad">{usd(s.deuda)}</b> : <b>—</b>}</div>
                        <div className="nd"><span className="k">En línea</span><b>{desde(n.ultimaVezEnLinea)}</b></div>
                        <div className="nd"><span className="k">Último pago</span><b>{n.ultimoPago ? usd(n.ultimoPago.monto) : "—"}</b></div>
                      </div>
                      <div className="neg-foot">
                        <button className="btn ghost press" onClick={() => setPagoNeg(n)}>Registrar pago</button>
                        <button className="btn ghost press" title="Enlace para que el dueño ponga contraseña nueva" onClick={() => pedirEnlace(n)}><UIcono k="lock" sw={2} />Clave</button>
                        {s.estadoEfectivo === "SUSPENDIDA"
                          ? <button className="btn primary press" onClick={() => accion(() => adminReactivar(s.negocioId), "Reactivado")}>Reactivar</button>
                          : <button className="btn danger press" onClick={() => accion(() => adminSuspender(s.negocioId), "Suspendido")}>Suspender</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {negs.length === 0 && !err && <p className="noresult">Sin negocios aún. Crea el primero con “Nuevo negocio”.</p>}
              {negs.length > 0 && lista.length === 0 && <p className="noresult">Ningún negocio coincide con la búsqueda.</p>}
            </div>
          </div>
        </div>
      </div>

      {modal && <FormNegocio onClose={() => setModal(false)} onSaved={() => { setModal(false); setMsg("Negocio creado"); cargar(); }} onErr={setErr} />}
      {seg && <Seguridad2fa onClose={() => setSeg(false)} onCambio={(a) => { setCon2fa(a); setMsg(a ? "Verificación en dos pasos activada" : "Verificación en dos pasos desactivada"); }} />}
      {enlace && <EnlaceClave {...enlace} onClose={() => setEnlace(null)} />}
      {pagoNeg && <FormPago neg={pagoNeg} onClose={() => setPagoNeg(null)} onSaved={() => { setPagoNeg(null); setMsg("Pago registrado"); cargar(); }} onErr={(e) => { setPagoNeg(null); setErr(e); }} />}
    </div>
  );
}

/** Enlace de un solo uso (24 h) para que el dueño ponga contraseña nueva: copiar o mandar por WhatsApp. */
function EnlaceClave({ neg, url, onClose }: { neg: string; url: string; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => { try { await navigator.clipboard.writeText(url); setCopiado(true); window.setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ } };
  const texto = `Hola, este es tu enlace para poner una contraseña nueva en KioskPOS (vence en 24 horas y sirve una sola vez): ${url}`;
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Cambiar clave del dueño</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">Mándale este enlace al dueño de <b>{neg}</b>. Vence en 24 horas y sirve una sola vez; al generar otro, este deja de servir.</span>
          <input className="inp" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace para cambiar la clave" />
          {copiado && <span className="pill ok" style={{ alignSelf: "flex-start" }}><UIcono k="check" sw={2.5} />Copiado</span>}
        </div>
        <div className="modal-foot two-btn">
          <button className="btn ghost big press" onClick={copiar}>{copiado ? "¡Copiado!" : "Copiar enlace"}</button>
          <a className="btn primary big press" href={"https://wa.me/?text=" + encodeURIComponent(texto)} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
        </div>
      </div>
    </div>
  );
}

const METODOS_PAGO = ["Pago móvil", "Transferencia", "Zelle", "Binance / USDT", "Efectivo"];

function FormPago({ neg, onClose, onSaved, onErr }: { neg: NegocioVista; onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
  const [monto, setMonto] = useState("25");
  const [metodo, setMetodo] = useState(METODOS_PAGO[0]);
  const [referencia, setReferencia] = useState("");
  const [meses, setMeses] = useState("1");
  const m = Number(monto.replace(",", "."));
  const nm = Number(meses) || 1;
  const ok = m > 0 && !!metodo;
  const guardar = async () => {
    try { await adminRegistrarPago(neg.situacion.negocioId, { monto: m, moneda: "USD", metodo, referencia: referencia.trim() || undefined, meses: nm }); onSaved(); }
    catch (e) { onErr((e as Error).message); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Registrar pago</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">Registra un pago que te hizo <b>{neg.situacion.nombre}</b>. Empuja su fecha de “pagó hasta” y reactiva el negocio si estaba suspendido.</span>
          <div className="two">
            <label className="lbl">Monto (USD)<div className="inpw"><i>$</i><input className="inp t pre" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} /></div></label>
            <label className="lbl">Meses<input className="inp t" inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value.replace(/\D/g, "").slice(0, 2))} /></label>
          </div>
          <label className="lbl">Método de pago
            <select className="inp" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {METODOS_PAGO.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="lbl">Referencia <span className="opt">(opcional)</span><input className="inp" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° de referencia" /></label>
          <span className="hint">Suma <b>{nm} mes(es)</b> a partir de hoy o de su fecha vigente.</span>
        </div>
        <div className="modal-foot"><button className="cta center press" disabled={!ok} onClick={guardar}>Confirmar pago</button></div>
      </div>
    </div>
  );
}

function FormNegocio({ onClose, onSaved, onErr }: { onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
  const [f, setF] = useState({ nombreNegocio: "", nombreDueno: "", email: "", password: "", telefono: "", direccion: "", cajasContratadas: "1" });
  const [horarios, setHorarios] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const ok = f.nombreNegocio.trim() && f.nombreDueno.trim() && f.email.trim() && f.password.length >= 6;
  const guardar = async () => {
    try {
      await adminCrearNegocio({
        nombreNegocio: f.nombreNegocio.trim(), nombreDueno: f.nombreDueno.trim(),
        email: f.email.trim(), password: f.password,
        telefono: f.telefono.trim() || undefined, direccion: f.direccion.trim() || undefined,
        cajasContratadas: Number(f.cajasContratadas) || 1, horariosCierre: horarios || undefined
      });
      onSaved();
    } catch (e) { onErr((e as Error).message); onClose(); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Nuevo negocio</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <label className="lbl">Nombre del negocio<input className="inp" value={f.nombreNegocio} onChange={set("nombreNegocio")} /></label>
          <label className="lbl">Nombre del dueño<input className="inp" value={f.nombreDueno} onChange={set("nombreDueno")} /></label>
          <label className="lbl">Correo del dueño<input className="inp" type="email" value={f.email} onChange={set("email")} /></label>
          <label className="lbl">Contraseña (mín. 6)<input className="inp" type="password" value={f.password} onChange={set("password")} /></label>
          <label className="lbl">Teléfono<input className="inp" value={f.telefono} onChange={set("telefono")} placeholder="0412-1234567" /></label>
          <label className="lbl">Dirección / local<input className="inp" value={f.direccion} onChange={set("direccion")} placeholder="Dónde queda la bodega" /></label>
          <label className="lbl">¿Cuántas cajas?<input className="inp t" type="number" min="1" value={f.cajasContratadas} onChange={set("cajasContratadas")} /></label>
          <div className="lbl"><span>Horarios de cierre de caja</span><HorariosCierre value={horarios} onChange={setHorarios} /></div>
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!ok} onClick={guardar}>Crear negocio y dueño</button></div>
      </div>
    </div>
  );
}
