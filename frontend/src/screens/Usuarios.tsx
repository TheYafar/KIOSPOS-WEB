import { useEffect, useState } from "react";
import { crearCaja, crearUsuario, listarCajas, listarUsuarios, type CajaInfo, type Usuario } from "../api";
import { type Rol } from "../session";
import { MiPlan } from "./MiPlan";
import { AjustesNegocio } from "./negocio";

const ROL_N: Record<string, string> = { DUENO: "Dueño", ENCARGADO: "Encargado", CAJERO: "Cajero", SOPORTE: "Soporte Técnico", SUPER_ADMIN: "Super admin" };

export function Usuarios({ onSalir }: { onSalir: () => void }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cajas, setCajas] = useState<CajaInfo[]>([]);
  const [modal, setModal] = useState<null | "usuario" | "caja">(null);
  const [tokenNuevo, setTokenNuevo] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = async () => { try { setUsuarios(await listarUsuarios()); setCajas(await listarCajas()); } catch (e) { setErr((e as Error).message); } };
  useEffect(() => { cargar(); }, []);

  return (
    <div className="caja">
      <div className="toolbar"><h1 style={{ margin: 0, fontSize: 16, flex: 1 }}>Equipo y cajas</h1>
        <button className="b pri" onClick={() => setModal("usuario")}>+ Usuario</button>
        <button className="b" onClick={() => setModal("caja")}>+ Caja</button>
      </div>
      {msg && <div className="toolbar" style={{ paddingTop: 0, color: "var(--ok)", fontSize: 13 }}>{msg}</div>}
      <div className="scroll">
        <MiPlan />
        <AjustesNegocio />
        {err && <p className="noresult">{err}</p>}
        <span className="k" style={{ color: "var(--text-2)", fontWeight: 500 }}>Usuarios</span>
        {usuarios.map((u) => (
          <div className="irow" key={u.id} style={{ gridTemplateColumns: "1fr auto" }}>
            <div><div className="nm">{u.nombreCompleto}</div><div className="mt"><span className="pill upd" style={{ background: "var(--surface-3)", color: "var(--text-2)", height: 22, padding: "0 8px" }}>{ROL_N[u.rol] || u.rol}</span>{!u.activo && <span className="mg-bad">inactivo</span>}</div></div>
          </div>
        ))}
        <span className="k" style={{ color: "var(--text-2)", fontWeight: 500, marginTop: 8 }}>Cajas</span>
        {cajas.map((c) => (
          <div className="irow" key={c.id} style={{ gridTemplateColumns: "1fr auto" }}>
            <div><div className="nm">{c.nombre}</div><div className="mt">{c.autorizada ? "Autorizada" : "Sin autorizar"} · {c.activa ? "activa" : "inactiva"}</div></div>
          </div>
        ))}
        {cajas.length === 0 && <p className="noresult">Sin cajas. Crea una para registrar un equipo.</p>}
        <button className="btn ghost" style={{ marginTop: 16 }} onClick={onSalir}>Cerrar sesión</button>
      </div>

      {modal === "usuario" && <FormUsuario onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg("Usuario creado"); cargar(); }} onErr={setErr} />}
      {modal === "caja" && <FormCaja onClose={() => setModal(null)} onToken={(t) => { setModal(null); setTokenNuevo(t); setMsg("Caja creada"); cargar(); }} onErr={setErr} />}
      {tokenNuevo && <TokenCaja token={tokenNuevo} onClose={() => setTokenNuevo(null)} />}
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

function FormCaja({ onClose, onToken, onErr }: { onClose: () => void; onToken: (t: string) => void; onErr: (s: string) => void }) {
  const [nombre, setNombre] = useState("Caja 1");
  const guardar = async () => { try { const c = await crearCaja(nombre.trim()); onToken(c.cajaToken); } catch (e) { onErr((e as Error).message); onClose(); } };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Nueva caja</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body"><label className="lbl">Nombre de la caja<input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <span className="hint">Al crearla se genera un token que se configura UNA vez en el equipo (navegador) de esa caja.</span></div>
        <div className="modal-foot"><button className="cta center press" disabled={!nombre.trim()} onClick={guardar}>Crear caja</button></div>
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

function TokenCaja({ token, onClose }: { token: string; onClose: () => void }) {
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
        <div className="modal-foot"><button className="cta center press" onClick={onClose}>Listo</button></div>
      </div>
    </div>
  );
}
