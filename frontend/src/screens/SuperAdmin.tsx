import { useEffect, useState } from "react";
import { adminAprobarPago, adminCrearNegocio, adminNegocios, adminPagosPendientes, adminReactivar, adminSuspender, type NegocioVista, type PagoPendiente } from "../api";

const usd = (n: number | string) => "$ " + Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pillCls: Record<string, string> = { ACTIVA: "ok", AVISO: "soon", SUSPENDIDA: "late" };

export function SuperAdmin({ onSalir }: { onSalir: () => void }) {
  const [negs, setNegs] = useState<NegocioVista[]>([]);
  const [pagos, setPagos] = useState<PagoPendiente[]>([]);
  const [modal, setModal] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = async () => {
    try { setNegs(await adminNegocios()); setPagos(await adminPagosPendientes()); setErr(""); }
    catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { cargar(); }, []);

  const accion = async (fn: () => Promise<void>, ok: string) => { try { await fn(); setMsg(ok); cargar(); } catch (e) { setErr((e as Error).message); } };

  const activos = negs.filter((n) => n.situacion.estadoEfectivo === "ACTIVA").length;
  const deuda = negs.reduce((s, n) => s + n.situacion.deuda, 0);

  return (
    <div className="app">
      <div className="shell">
        <nav className="rail" aria-label="Menú"><span className="logo">K</span></nav>
        <div className="appmain">
          <header className="hdr">
            <div><h1>Administración</h1><div className="sub">Super admin · uriel</div></div>
            <button className="b" onClick={onSalir}>Salir</button>
          </header>
          <div className="caja">
            <div className="toolbar"><div style={{ flex: 1 }} /><button className="b pri" onClick={() => setModal(true)}>Nuevo negocio</button></div>
            {msg && <div className="toolbar" style={{ paddingTop: 0, color: "var(--ok)", fontSize: 13 }}>{msg}</div>}
            <div className="scroll">
              <div className="bento">
                <div className="bx"><span className="k">Negocios</span><span className="v t">{negs.length}</span></div>
                <div className="bx"><span className="k">Activos</span><span className="v t" style={{ color: "var(--ok)" }}>{activos}</span></div>
                <div className="bx wide"><span className="k">Por cobrar (deuda acumulada)</span><span className="v t">{usd(deuda)}</span></div>
              </div>
              {err && <p className="noresult">{err}</p>}

              {pagos.length > 0 && (
                <div className="bx wide">
                  <span className="k">Pagos por aprobar</span>
                  {pagos.map((p) => (
                    <div className="mrow" key={p.id} style={{ gridTemplateColumns: "1fr auto", marginTop: 6 }}>
                      <span className="ml">Negocio #{p.negocioId} · {usd(p.monto)} · {p.metodo}{p.referencia ? " · " + p.referencia : ""} · {p.meses} mes(es)</span>
                      <button className="b pri" onClick={() => accion(() => adminAprobarPago(p.id), "Pago aprobado")}>Aprobar</button>
                    </div>
                  ))}
                </div>
              )}

              {negs.map((n) => {
                const s = n.situacion;
                return (
                  <div className="irow" key={s.negocioId} style={{ gridTemplateColumns: "1fr auto", alignItems: "start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="nm">{s.nombre} <span className={"pill " + (pillCls[s.estadoEfectivo] || "late")}><i />{s.estadoEfectivo}</span></div>
                      <div className="mt">
                        <span>Plan {s.plan}</span><span>·</span>
                        <span>Pagó hasta: {s.pagoHasta || "—"}</span><span>·</span>
                        <span>{n.cajas} caja(s)</span>
                        {s.mesesPendientes > 0 && <><span>·</span><span className="mg-bad">Debe {usd(s.deuda)}</span></>}
                      </div>
                      {n.ultimoPago && <div className="mt">Último pago: {n.ultimoPago.monto}{n.ultimoPago.referencia ? " · " + n.ultimoPago.referencia : ""}</div>}
                    </div>
                    <div className="rt">
                      {s.estadoEfectivo === "SUSPENDIDA"
                        ? <button className="b pri" onClick={() => accion(() => adminReactivar(s.negocioId), "Reactivado")}>Reactivar</button>
                        : <button className="b bad" onClick={() => accion(() => adminSuspender(s.negocioId), "Suspendido")}>Suspender</button>}
                    </div>
                  </div>
                );
              })}
              {negs.length === 0 && !err && <p className="noresult">Sin negocios aún.</p>}
            </div>
          </div>
        </div>
      </div>

      {modal && <FormNegocio onClose={() => setModal(false)} onSaved={() => { setModal(false); setMsg("Negocio creado"); cargar(); }} onErr={setErr} />}
    </div>
  );
}

function FormNegocio({ onClose, onSaved, onErr }: { onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
  const [f, setF] = useState({ nombreNegocio: "", nombreDueno: "", email: "", password: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const ok = f.nombreNegocio.trim() && f.nombreDueno.trim() && f.email.trim() && f.password.length >= 6;
  const guardar = async () => { try { await adminCrearNegocio({ ...f, nombreNegocio: f.nombreNegocio.trim(), nombreDueno: f.nombreDueno.trim(), email: f.email.trim() }); onSaved(); } catch (e) { onErr((e as Error).message); onClose(); } };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Nuevo negocio</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <label className="lbl">Nombre del negocio<input className="inp" value={f.nombreNegocio} onChange={set("nombreNegocio")} /></label>
          <label className="lbl">Nombre del dueño<input className="inp" value={f.nombreDueno} onChange={set("nombreDueno")} /></label>
          <label className="lbl">Correo del dueño<input className="inp" type="email" value={f.email} onChange={set("email")} /></label>
          <label className="lbl">Contraseña (mín. 6)<input className="inp" type="password" value={f.password} onChange={set("password")} /></label>
        </div>
        <div className="modal-foot"><button className="cta center press" disabled={!ok} onClick={guardar}>Crear negocio y dueño</button></div>
      </div>
    </div>
  );
}
