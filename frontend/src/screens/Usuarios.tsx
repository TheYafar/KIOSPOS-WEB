import { useEffect, useState } from "react";
import { borrarCaja, borrarUsuario, crearCaja, crearUsuario, editarUsuario, listarCajas, listarUsuarios, renombrarCaja, type CajaInfo, type Usuario } from "../api";
import { getSesion, type Rol } from "../session";
import { UIcono } from "../icons";
import { MiPlan } from "./MiPlan";
import { AjustesNegocio } from "./negocio";
import { adoptarCaja, cajaLocalId, esteEquipoEsCaja } from "../esteEquipo";

const ROL_N: Record<string, string> = { DUENO: "Dueño", ENCARGADO: "Encargado", CAJERO: "Cajero", SOPORTE: "Soporte Técnico", SUPER_ADMIN: "Super admin" };

export function Usuarios({ onSalir }: { onSalir: () => void }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cajas, setCajas] = useState<CajaInfo[]>([]);
  const [modal, setModal] = useState<null | "usuario" | "caja">(null);
  const [editUsuario, setEditUsuario] = useState<Usuario | null>(null);
  const [editCaja, setEditCaja] = useState<CajaInfo | null>(null);
  const [tokenNuevo, setTokenNuevo] = useState<{ token: string; id: number } | null>(null);
  const [localId, setLocalId] = useState(cajaLocalId());
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const miId = getSesion()?.usuarioId;

  const cargar = async () => { try { setUsuarios(await listarUsuarios()); setCajas(await listarCajas()); } catch (e) { setErr((e as Error).message); } };
  useEffect(() => { cargar(); }, []);
  const avisar = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };
  const eliminarUsuario = async (u: Usuario) => {
    if (!window.confirm(`¿Eliminar a ${u.nombreCompleto}? No podrá entrar y dejará de salir en la lista.`)) return;
    try { await borrarUsuario(u.id); avisar("Usuario eliminado"); cargar(); } catch (e) { setErr((e as Error).message); }
  };
  const eliminarCaja = async (c: CajaInfo) => {
    if (!window.confirm(`¿Eliminar la caja "${c.nombre}"? El equipo que la tiene configurada ya no podrá cobrar y tendrás que registrarla de nuevo.`)) return;
    try { await borrarCaja(c.id); avisar("Caja eliminada"); cargar(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="caja">
      <div className="toolbar"><h1 style={{ margin: 0, fontSize: 16, flex: 1 }}>Equipo y cajas</h1>
        <button className="b pri" onClick={() => setModal("usuario")}>+ Usuario</button>
        <button className="b" onClick={() => setModal("caja")}>+ Caja</button>
      </div>
      {msg && <div className="toolbar" style={{ paddingTop: 0, color: "var(--ok)", fontSize: 13 }}>{msg}</div>}
      <div className="scroll">
        <div className="mas-grid">
        <div className="mas-col">
        <MiPlan />
        <AjustesNegocio />
        </div>
        <div className="mas-col">
        {err && <p className="noresult">{err}</p>}
        <span className="k" style={{ color: "var(--text-2)", fontWeight: 500 }}>Usuarios</span>
        {usuarios.map((u) => (
          <div className="irow eq-row" key={u.id}>
            <div><div className="nm">{u.nombreCompleto}</div><div className="mt"><span className="pill upd" style={{ background: "var(--surface-3)", color: "var(--text-2)", height: 22, padding: "0 8px" }}>{ROL_N[u.rol] || u.rol}</span>{!u.activo && <span className="mg-bad">inactivo</span>}{u.id === miId && <small> · tú</small>}</div></div>
            {!u.esSoporte && u.rol !== "DUENO" && (
              <div className="eq-acc">
                <button className="btn2 sm press" onClick={() => setEditUsuario(u)}>Editar</button>
                {u.id !== miId && <button className="btn2 sm press eq-del" aria-label={"Eliminar " + u.nombreCompleto} onClick={() => eliminarUsuario(u)}><UIcono k="del" sw={2} /></button>}
              </div>
            )}
          </div>
        ))}
        <span className="k" style={{ color: "var(--text-2)", fontWeight: 500, marginTop: 8 }}>Cajas</span>
        {cajas.map((c) => (
          <div className="irow eq-row" key={c.id}>
            <div><div className="nm">{c.nombre}{c.id === localId && esteEquipoEsCaja() && <span className="pill ok eq-aqui">Este equipo</span>}</div><div className="mt">{c.autorizada ? "Autorizada" : "Sin autorizar"} · {c.activa ? "activa" : "inactiva"}</div></div>
            <div className="eq-acc">
              <button className="btn2 sm press" onClick={() => setEditCaja(c)}>Editar</button>
              <button className="btn2 sm press eq-del" aria-label={"Eliminar " + c.nombre} onClick={() => eliminarCaja(c)}><UIcono k="del" sw={2} /></button>
            </div>
          </div>
        ))}
        {cajas.length === 0 && <p className="noresult">Sin cajas. Toca <b>+ Caja</b> y usa este mismo equipo para cobrar.</p>}
        <button className="btn ghost" style={{ marginTop: 16 }} onClick={onSalir}>Cerrar sesión</button>
        </div>
        </div>
      </div>

      {modal === "usuario" && <FormUsuario onClose={() => setModal(null)} onSaved={() => { setModal(null); avisar("Usuario creado"); cargar(); }} onErr={setErr} />}
      {modal === "caja" && <FormCaja numero={cajas.length + 1} onClose={() => setModal(null)}
        onAqui={() => { setModal(null); setLocalId(cajaLocalId()); avisar("Listo: este equipo ya es tu caja"); cargar(); }}
        onToken={(t, id) => { setModal(null); setTokenNuevo({ token: t, id }); avisar("Caja creada"); cargar(); }} onErr={setErr} />}
      {editUsuario && <EditarUsuario usuario={editUsuario} onClose={() => setEditUsuario(null)} onSaved={() => { setEditUsuario(null); avisar("Usuario actualizado"); cargar(); }} onErr={setErr} />}
      {editCaja && <EditarCaja caja={editCaja} onClose={() => setEditCaja(null)} onSaved={() => { setEditCaja(null); avisar("Caja actualizada"); cargar(); }} onErr={setErr} />}
      {tokenNuevo && <TokenCaja token={tokenNuevo.token} onClose={() => setTokenNuevo(null)}
        onAqui={() => { adoptarCaja(tokenNuevo.token, tokenNuevo.id); setLocalId(tokenNuevo.id); setTokenNuevo(null); avisar("Listo: este equipo ya es tu caja"); }} />}
    </div>
  );
}

function FormUsuario({ onClose, onSaved, onErr }: { onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
  const [rol, setRol] = useState<Rol>("CAJERO");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const esCajero = rol === "CAJERO";
  const ok = nombre.trim() && (esCajero ? /^\d{4}$/.test(pin) : email.trim() && password.length >= 6);
  const guardar = async () => {
    try { await crearUsuario(esCajero ? { rol, nombreCompleto: nombre.trim(), pin } : { rol, nombreCompleto: nombre.trim(), email: email.trim(), password }); onSaved(); }
    catch (e) { onErr((e as Error).message); onClose(); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Nuevo usuario</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, background: "var(--surface-3)", borderRadius: 12, padding: 3 }}>
            {([["CAJERO", "Cajero (PIN)"], ["ENCARGADO", "Encargado (correo)"]] as const).map(([r, n]) => (
              <button key={r} className="b" style={{ background: rol === r ? "var(--surface)" : "transparent", boxShadow: rol === r ? "var(--sh-1)" : "none" }} onClick={() => setRol(r)}>{n}</button>
            ))}
          </div>
          <label className="lbl">Nombre completo<input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          {esCajero
            ? <label className="lbl">PIN (4 dígitos)<input className="inp t" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
            : <>
                <label className="lbl">Correo<input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <label className="lbl">Contraseña (mín. 6)<input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              </>}
        </div>
        <div className="modal-foot"><button className="cta center press" disabled={!ok} onClick={guardar}>Guardar</button></div>
      </div>
    </div>
  );
}

function EditarUsuario({ usuario, onClose, onSaved, onErr }: { usuario: Usuario; onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
  const esCajero = usuario.rol === "CAJERO";
  const [nombre, setNombre] = useState(usuario.nombreCompleto);
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const ok = nombre.trim() && (!pin || /^\d{4}$/.test(pin)) && (!password || password.length >= 6);
  const guardar = async () => {
    try {
      await editarUsuario(usuario.id, { nombreCompleto: nombre.trim(), ...(esCajero ? (pin ? { pin } : {}) : (password ? { password } : {})) });
      onSaved();
    } catch (e) { onErr((e as Error).message); onClose(); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Editar {ROL_N[usuario.rol] || usuario.rol}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <label className="lbl">Nombre completo<input className="inp" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          {esCajero
            ? <label className="lbl">Cambiar PIN <span className="opt">(déjalo vacío para no cambiarlo)</span><input className="inp t" inputMode="numeric" value={pin} placeholder="4 dígitos" onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
            : <label className="lbl">Cambiar contraseña <span className="opt">(vacío = no cambiar)</span><input className="inp" type="password" value={password} placeholder="mín. 6" onChange={(e) => setPassword(e.target.value)} /></label>}
        </div>
        <div className="modal-foot"><button className="cta center press" disabled={!ok} onClick={guardar}>Guardar</button></div>
      </div>
    </div>
  );
}

function EditarCaja({ caja, onClose, onSaved, onErr }: { caja: CajaInfo; onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
  const [nombre, setNombre] = useState(caja.nombre);
  const guardar = async () => { try { await renombrarCaja(caja.id, nombre.trim()); onSaved(); } catch (e) { onErr((e as Error).message); onClose(); } };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Editar caja</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body"><label className="lbl">Nombre de la caja<input className="inp" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} /></label></div>
        <div className="modal-foot"><button className="cta center press" disabled={!nombre.trim()} onClick={guardar}>Guardar</button></div>
      </div>
    </div>
  );
}

function FormCaja({ numero, onClose, onAqui, onToken, onErr }: { numero: number; onClose: () => void; onAqui: () => void; onToken: (t: string, id: number) => void; onErr: (s: string) => void }) {
  const yaEsCaja = esteEquipoEsCaja();
  const [nombre, setNombre] = useState("Caja " + numero);
  const [donde, setDonde] = useState<"aqui" | "otro">(yaEsCaja ? "otro" : "aqui");
  const [yendo, setYendo] = useState(false);
  const guardar = async () => {
    setYendo(true);
    try {
      const c = await crearCaja(nombre.trim());
      if (donde === "aqui") { adoptarCaja(c.cajaToken, c.id); onAqui(); } else onToken(c.cajaToken, c.id);
    } catch (e) { onErr((e as Error).message); onClose(); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Nueva caja</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <label className="lbl">Nombre de la caja<input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <span className="k" style={{ color: "var(--text-2)", fontWeight: 500 }}>¿Dónde se va a cobrar?</span>
          <div className="caja-donde" role="radiogroup" aria-label="Dónde se va a cobrar">
            <button type="button" role="radio" aria-checked={donde === "aqui"} className={"caja-op press" + (donde === "aqui" ? " on" : "")} onClick={() => setDonde("aqui")}>
              <b>En este equipo</b><small>{yaEsCaja ? "Reemplaza la caja que tenía este equipo." : "Queda listo ya mismo, sin copiar nada."}</small>
            </button>
            <button type="button" role="radio" aria-checked={donde === "otro"} className={"caja-op press" + (donde === "otro" ? " on" : "")} onClick={() => setDonde("otro")}>
              <b>En otro equipo</b><small>Te damos un enlace para abrirlo en ese equipo.</small>
            </button>
          </div>
        </div>
        <div className="modal-foot"><button className="cta center press" disabled={!nombre.trim() || yendo} onClick={guardar}>{donde === "aqui" ? "Crear y usar este equipo" : "Crear caja"}</button></div>
      </div>
    </div>
  );
}

/** Copia texto al portapapeles con respaldo (execCommand) si el navegador bloquea la API moderna. */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texto); return true; }
  } catch { /* cae al respaldo */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = texto; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function TokenCaja({ token, onClose, onAqui }: { token: string; onClose: () => void; onAqui: () => void }) {
  const [copiado, setCopiado] = useState<"" | "enlace" | "token">("");
  const [falló, setFalló] = useState(false);
  const enlace = window.location.origin + "/#caja=" + encodeURIComponent(token);
  const copiar = async (texto: string, cual: "enlace" | "token") => {
    const ok = await copiarTexto(texto);
    if (ok) { setFalló(false); setCopiado(cual); setTimeout(() => setCopiado(""), 2000); }
    else { setFalló(true); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Token de la caja</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">En el equipo de la caja: <b>abre el enlace de configuración</b> (lo más fácil) o pega el token a mano. No se vuelve a mostrar.</span>
          <div className="receipt"><pre className="t" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{token}</pre></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button className={"b pri" + (copiado === "enlace" ? " ok" : "")} onClick={() => copiar(enlace, "enlace")}>{copiado === "enlace" ? "✓ ¡Copiado!" : "Copiar enlace"}</button>
            <button className={"b" + (copiado === "token" ? " ok" : "")} onClick={() => copiar(token, "token")}>{copiado === "token" ? "✓ ¡Copiado!" : "Copiar token"}</button>
          </div>
          {copiado && <span className="pill ok" style={{ alignSelf: "flex-start" }}>{copiado === "enlace" ? "Enlace copiado" : "Token copiado"} — pégalo en el equipo de la caja</span>}
          {falló && <span className="pinmsg err">No se pudo copiar automáticamente. Selecciona el token de arriba y cópialo a mano (Ctrl+C).</span>}
        </div>
        <div className="modal-foot two-btn">
          <button className="btn2 big press" onClick={onAqui}>Mejor uso este equipo</button>
          <button className="cta center press" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
