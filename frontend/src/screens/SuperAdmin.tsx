import { useEffect, useState } from "react";
import { adminAprobarPago, adminCrearNegocio, adminNegocios, adminPagosPendientes, adminReactivar, adminSuspender, type NegocioVista, type PagoPendiente } from "../api";
import { UIcono } from "../icons";
import { HorariosCierre } from "./negocio";

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
            <div className="hpills"><button className="btn primary press" onClick={() => setModal(true)}><UIcono k="plus" sw={2.2} />Nuevo negocio</button></div>
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
