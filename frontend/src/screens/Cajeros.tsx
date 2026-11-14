import { useEffect, useState } from "react";
import { borrarUsuario, crearUsuario, editarUsuario, listarCajas, listarUsuarios, miSuscripcion, type CajaInfo, type Situacion, type Usuario } from "../api";
import { UIcono } from "../icons";
import { cajaLocalId, esteEquipoEsCaja, usarEsteEquipoComoCaja } from "../esteEquipo";

// Tarjeta de CAJEROS en el inicio del dueño: ve sus cajeros (los que cobran con PIN) y,
// si no tiene, un botón para agregarlos. Muestra el cupo de cajas de su plan, porque un
// cajero entra en una caja registrada.

/** Panel de cajeros del dueño. `onIrEquipo` lleva a "Equipo y cajas" (pestaña Más). */
export function Cajeros({ onIrEquipo }: { onIrEquipo: () => void }) {
  const [cajeros, setCajeros] = useState<Usuario[] | null>(null);
  const [cajas, setCajas] = useState<CajaInfo[]>([]);
  const [plan, setPlan] = useState<Situacion | null>(null);
  const [form, setForm] = useState<null | Usuario>(null); // Usuario = editar; objeto vacío = nuevo
  const [nuevo, setNuevo] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [aqui, setAqui] = useState(esteEquipoEsCaja());
  const [yendo, setYendo] = useState(false);

  const cargar = async () => {
    try {
      const [us, cj] = await Promise.all([listarUsuarios(), listarCajas()]);
      setCajeros(us.filter((u) => u.rol === "CAJERO"));
      setCajas(cj);
    } catch (e) { setErr((e as Error).message); setCajeros([]); }
    miSuscripcion().then(setPlan).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);
  const avisar = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };
  const eliminar = async (u: Usuario) => {
    if (!window.confirm(`¿Eliminar al cajero ${u.nombreCompleto}? No podrá entrar a cobrar.`)) return;
    try { await borrarUsuario(u.id); avisar("Cajero eliminado"); cargar(); } catch (e) { setErr((e as Error).message); }
  };

  const usarEquipo = async () => {
    setYendo(true); setErr("");
    try { await usarEsteEquipoComoCaja("Caja " + (cajas.length + 1)); setAqui(true); avisar("Listo: este equipo ya es tu caja"); cargar(); }
    catch (e) { setErr((e as Error).message); }
    finally { setYendo(false); }
  };

  if (!cajeros) return null;
  const maxCajas = plan?.cajasContratadas ?? 1;

  return (
    <section className="card cj-card">
      <div className="cj-head">
        <div><b>Tus cajeros</b><span>Entran con su PIN de 4 dígitos en una caja registrada.</span></div>
        <button className="btn primary press" onClick={() => setNuevo(true)}><UIcono k="plus" sw={2.2} />Agregar cajero</button>
      </div>
      {msg && <span className="pill ok cj-msg"><UIcono k="check" sw={2.5} />{msg}</span>}
      {err && <p className="pinmsg err">{err}</p>}
      {cajeros.length === 0 ? (
        <div className="cj-empty">
          <span className="cj-ic"><UIcono k="user" sw={1.8} /></span>
          <div><b>Aún no tienes cajeros</b>
            <span>Agrega a las personas que cobran en tu bodega. Cada una entra con su PIN.{cajas.length === 0 ? " Primero crea tu caja: el equipo donde se cobra." : ""}</span></div>
          <button className="btn primary press" onClick={() => setNuevo(true)}>Agregar mi primer cajero</button>
        </div>
      ) : (
        <div className="cj-list">
          {cajeros.map((u) => (
            <div className="cj-row" key={u.id}>
              <span className="cj-av">{u.nombreCompleto.charAt(0).toUpperCase()}</span>
              <div className="cj-nm"><b>{u.nombreCompleto}</b><small>Cajero · entra con PIN</small></div>
              <div className="cj-acc">
                <button className="btn2 sm press" onClick={() => setForm(u)}>Editar</button>
                <button className="btn2 sm press cj-del" aria-label={"Eliminar " + u.nombreCompleto} onClick={() => eliminar(u)}><UIcono k="del" sw={2} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="cj-cajas">
        <span className="cj-cajas-h">Tus cajas</span>
        {cajas.length > 0 ? (
          <div className="cj-chips">{cajas.map((c) => (
            <span key={c.id} className="cj-chip"><UIcono k="cash" sw={1.9} />{c.nombre}{c.id === cajaLocalId() && aqui && <small> · este equipo</small>}</span>
          ))}</div>
        ) : <span className="cj-cajas-v">Todavía no tienes cajas.</span>}
        {!aqui && cajas.length < maxCajas && (
          <button className="btn primary press" disabled={yendo} onClick={usarEquipo}>{yendo ? "Listo…" : "Usar este equipo como caja"}</button>
        )}
      </div>
      <div className="cj-plan">
        <span>Tu plan permite <b>{maxCajas}</b> {maxCajas === 1 ? "caja" : "cajas"}. Tienes <b>{cajas.length}</b> registrada{cajas.length === 1 ? "" : "s"}.</span>
        <button className="btn2 press" onClick={onIrEquipo}>Equipo y cajas</button>
      </div>
      {nuevo && <FormCajero onClose={() => setNuevo(false)} onSaved={() => { setNuevo(false); avisar("Cajero agregado"); cargar(); }} onErr={setErr} />}
      {form && <FormCajero cajero={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); avisar("Cajero actualizado"); cargar(); }} onErr={setErr} />}
    </section>
  );
}

function FormCajero({ cajero, onClose, onSaved, onErr }: { cajero?: Usuario; onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
  const editar = !!cajero;
  const [nombre, setNombre] = useState(cajero?.nombreCompleto || "");
  const [pin, setPin] = useState("");
  const ok = nombre.trim() && (editar ? (!pin || /^\d{4}$/.test(pin)) : /^\d{4}$/.test(pin));
  const guardar = async () => {
    try {
      if (editar) await editarUsuario(cajero!.id, { nombreCompleto: nombre.trim(), ...(pin ? { pin } : {}) });
      else await crearUsuario({ rol: "CAJERO", nombreCompleto: nombre.trim(), pin });
      onSaved();
    } catch (e) { onErr((e as Error).message); onClose(); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>{editar ? "Editar cajero" : "Nuevo cajero"}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body" onKeyDown={(e) => { if (e.key === "Enter" && ok) { e.preventDefault(); guardar(); } }}>
          <label className="lbl">Nombre del cajero<input className="inp" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: María" /></label>
          <label className="lbl">{editar ? "Cambiar PIN " : "PIN de 4 dígitos"}{editar && <span className="opt">(vacío = no cambiar)</span>}
            <input className="inp t" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4 dígitos" /></label>
          <span className="hint">Con este PIN entra a cobrar en la caja. Puedes cambiarlo cuando quieras.</span>
        </div>
        <div className="modal-foot"><button className="cta center press" disabled={!ok} onClick={guardar}>Guardar</button></div>
      </div>
    </div>
  );
}
