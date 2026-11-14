import { useCallback, useEffect, useState } from "react";
import { adminLogin, crearDemo, listarCajeros, loginCajero, loginDueno, olvideClave, opcionesEntrada, recuperarConCodigo, registrarNegocio, Requiere2fa, restablecerClave, tasaBcvServidor, type Cajero, type OpcionesEntrada } from "../api";
import { marcarBienvenida } from "../esteEquipo";
import { guardarDemo } from "../demo";
import { AyudaWhatsApp, CodigoRecuperacion } from "./Ayuda";
import { getCajaToken, getSesion, getTasa, setCajaToken, setSesion, setTasa, type Sesion } from "../session";
import { UIcono } from "../icons";
import { TemaBtn } from "../TemaBtn";
import { TamBtn } from "../TamBtn";
import { setBcv, tasaEfectiva } from "../config";

type Vista = "config" | "pin" | "dueno" | "admin" | "olvide" | "reset" | "registro";

const AV_COLORES = [
  "var(--c-bebidas)", "var(--c-limpieza)", "var(--c-chucherias)",
  "var(--c-viveres)", "var(--c-charcuteria)", "var(--c-panaderia)"
];

function saludoHora(): string {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Pantalla de entrada (rediseño 04): panel oscuro con reloj + "¿Quién va a cobrar?" con PIN. */
export function Login({ onLogin }: { onLogin: (s: Sesion) => void }) {
  const [vista, setVista] = useState<Vista>(() => {
    // Desde la demo, "Crear mi cuenta" llega directo al registro.
    try { if (sessionStorage.getItem("kp_ir_registro")) { sessionStorage.removeItem("kp_ir_registro"); return "registro"; } } catch { /* ignore */ }
    return getCajaToken() ? "pin" : "dueno";
  });
  const [opc, setOpc] = useState<OpcionesEntrada>({ registro: true, demo: true, correo: false });
  const [codigoRec, setCodigoRec] = useState("");
  const [codigoNuevo, setCodigoNuevo] = useState("");
  const [porCorreo, setPorCorreo] = useState(false);
  const [abriendoDemo, setAbriendoDemo] = useState(false);
  const [cajeros, setCajeros] = useState<Cajero[]>([]);
  const [sel, setSel] = useState<Cajero | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  // Si la sesión venció, la app deja aquí el aviso antes de volver a esta pantalla.
  const [aviso] = useState(() => {
    try { const m = sessionStorage.getItem("kp_aviso_login") || ""; sessionStorage.removeItem("kp_aviso_login"); return m; } catch { return ""; }
  });
  const [pinErr, setPinErr] = useState("");
  const [shake, setShake] = useState(false);
  const [reloj, setReloj] = useState(new Date());

  const [cajaTok, setCajaTok] = useState(getCajaToken());
  const [tasa, setTasaLocal] = useState(getTasa());
  const [guardando, setGuardando] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [codigo, setCodigo] = useState("");
  const [pide2fa, setPide2fa] = useState(false);
  const [ok, setOk] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resetTok, setResetTok] = useState("");
  const [negocio, setNegocio] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");

  useEffect(() => { opcionesEntrada().then(setOpc).catch(() => { /* deja lo de por defecto */ }); }, []);

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Tasa BCV automática: prellenar con la del servidor (el cajero no la escribe).
  useEffect(() => {
    tasaBcvServidor().then((t) => { if (t.bs) { setBcv(t.bs); const e = tasaEfectiva(t.bs); setTasa(String(e)); setTasaLocal(String(e)); } }).catch(() => { /* usa la última */ });
  }, []);

  // Enlace de configuración: abrir .../#caja=TOKEN en el equipo lo precarga y abre la config.
  // Siempre lo lleva a la config (aunque ya haya un token guardado) para poder re-emparejar.
  useEffect(() => {
    const m = window.location.hash.match(/caja=([^&]+)/);
    if (m) {
      setCajaTok(decodeURIComponent(m[1]));
      setVista("config");
      try { history.replaceState(null, "", window.location.pathname); } catch { /* ignore */ }
    }
    // Enlace de "olvidé mi contraseña": .../#reset=TOKEN abre el formulario de clave nueva.
    const r = window.location.hash.match(/reset=([^&]+)/);
    if (r) {
      setResetTok(decodeURIComponent(r[1]));
      setVista("reset");
      try { history.replaceState(null, "", window.location.pathname); } catch { /* ignore */ }
    }
  }, []);

  const cargarCajeros = useCallback(async () => {
    try {
      setCajeros(await listarCajeros());
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (vista === "pin" && getCajaToken()) {
      cargarCajeros();
    }
  }, [vista, cargarCajeros]);

  const guardarConfig = async () => {
    const tok = cajaTok.trim();
    const prev = getCajaToken();
    setGuardando(true);
    setErr("");
    setCajaToken(tok);          // listarCajeros usa el token guardado (header X-Caja-Token)
    setTasa(tasa.trim());
    try {
      await listarCajeros();    // valida el token contra el servidor ANTES de dejar entrar
      setVista("pin");
    } catch {
      setCajaToken(prev);       // token inválido: revertir para no dejar el equipo roto
      setErr("Esa caja no se reconoce. Revisa el enlace o el token que te dio el dueño en su panel.");
    } finally {
      setGuardando(false);
    }
  };

  const confirmarPin = useCallback(async (persona: Cajero, codigo: string) => {
    try {
      onLogin(await loginCajero(persona.id, codigo));
    } catch (e) {
      // El servidor dice cuántos intentos quedan o si se bloqueó por seguridad.
      const m = (e as Error).message || "";
      setPinErr(/PIN|intentos/i.test(m) ? m : "PIN incorrecto. Intenta de nuevo.");
      setPin("");
      setShake(true);
      setTimeout(() => setShake(false), 350);
    }
  }, [onLogin]);

  const tecla = (v: string) => {
    if (!sel) {
      return;
    }
    let np = pin;
    if (v === "clr") { np = ""; }
    else if (v === "del") { np = pin.slice(0, -1); }
    else if (pin.length < 4) { np = pin + v; }
    setPin(np);
    setPinErr("");
    if (np.length === 4) {
      confirmarPin(sel, np);
    }
  };

  // Teclado en la pantalla de PIN: números escriben el PIN (si no hay nadie elegido,
  // se elige el primer cajero), ←/→ cambian de cajero, Retroceso borra, Esc limpia.
  useEffect(() => {
    if (vista !== "pin") return;
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (!sel) { if (cajeros.length) { setSel(cajeros[0]); setPin(e.key); setPinErr(""); } return; }
        tecla(e.key);
      } else if (e.key === "Backspace") { e.preventDefault(); tecla("del"); }
      else if (e.key === "Escape") { e.preventDefault(); if (pin) tecla("clr"); else setSel(null); }
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        if (!cajeros.length) return;
        e.preventDefault();
        const i = sel ? cajeros.findIndex((c) => c.id === sel.id) : -1;
        const n = e.key === "ArrowRight" ? (i + 1) % cajeros.length : (i <= 0 ? cajeros.length - 1 : i - 1);
        setSel(cajeros[n]); setPin(""); setPinErr("");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const entrarDueno = async () => {
    setOk("");
    try {
      onLogin(await loginDueno(email.trim(), pass));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const correoOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const registroListo = negocio.trim() && nombre.trim() && correoOk && pass.length >= 8 && pass === pass2 && !enviando;
  const registrar = async () => {
    if (!registroListo) return;
    setEnviando(true); setErr("");
    try {
      const r = await registrarNegocio({ negocio: negocio.trim(), nombre: nombre.trim(), telefono: telefono.trim() || undefined, email: email.trim(), password: pass });
      marcarBienvenida();
      try { if (r.codigo) sessionStorage.setItem("kp_codigo_rec", r.codigo); } catch { /* ignore */ }
      onLogin(r.sesion);
    } catch (e) { setErr((e as Error).message); setEnviando(false); }
  };

  const probarDemo = async () => {
    setAbriendoDemo(true); setErr("");
    try {
      const d = await crearDemo();
      guardarDemo(d);
      setSesion(d.dueno);
      onLogin(d.dueno);
    } catch (e) { setErr((e as Error).message); setAbriendoDemo(false); }
  };

  const recuperar = async () => {
    if (pass.length < 8) { setErr("La contraseña nueva debe tener al menos 8 caracteres"); return; }
    if (pass !== pass2) { setErr("Las dos contraseñas no coinciden"); return; }
    setEnviando(true); setErr("");
    try {
      const r = await recuperarConCodigo(email.trim(), codigoRec.trim(), pass);
      setCodigoNuevo(r.codigoNuevo);
    } catch (e) { setErr((e as Error).message); }
    finally { setEnviando(false); }
  };

  const entrarAdmin = async () => {
    try {
      await adminLogin(email.trim(), pass, codigo.trim());
      const s = getSesion();
      if (s) onLogin(s);
    } catch (e) {
      if (e instanceof Requiere2fa) { setPide2fa(true); setErr(""); return; }
      setErr((e as Error).message);
      setCodigo("");
    }
  };

  const pedirEnlace = async () => {
    setEnviando(true); setErr("");
    try { setOk(await olvideClave(email.trim())); }
    catch (e) { setErr((e as Error).message); }
    finally { setEnviando(false); }
  };

  const ponerClave = async () => {
    if (pass.length < 8) { setErr("La contraseña debe tener al menos 8 caracteres"); return; }
    if (pass !== pass2) { setErr("Las dos contraseñas no coinciden"); return; }
    setEnviando(true); setErr("");
    try {
      const correo = await restablecerClave(resetTok, pass);
      setEmail(correo); setPass(""); setPass2("");
      setOk("¡Listo! Ya puedes entrar con tu contraseña nueva.");
      setVista("dueno");
    } catch (e) { setErr((e as Error).message); }
    finally { setEnviando(false); }
  };

  const fecha = reloj.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
  const hora = reloj.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });

  const side = (
    <aside className="entrar-side">
      <i className="deco" style={{ left: "55%", top: "-110px", width: 360, height: 360, background: "var(--nav-active)" }} />
      <i className="deco" style={{ left: "60%", top: "62%", width: 260, height: 260, background: "var(--primary)", opacity: .3 }} />
      <i className="deco" style={{ left: "-70px", top: "70%", width: 180, height: 180, background: "var(--nav-active)", opacity: .7 }} />
      <div className="entrar-brand"><span className="logo">K</span><b>KioskPOS</b></div>
      <div className="entrar-tema entrar-btns"><TamBtn /><TemaBtn /></div>
      <div className="entrar-clock">
        <div className="hh t">{hora}</div>
        <div className="dd">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</div>
      </div>
      <div className="shop">
        <div className="r"><span>Equipo</span><b>{getCajaToken() ? "Caja registrada" : "Sin registrar"}</b></div>
        <div className="r"><span>Tasa BCV de hoy</span><b className="t">Bs {getTasa()}</b></div>
      </div>
    </aside>
  );

  if (vista === "config") {
    return (
      <div className="app"><div className="entrar">{side}
        <main className="entrar-main">
          <div className="entrar-head"><h1>Primera vez en este equipo</h1><p>Vas a dejar este equipo listo como la caja donde se cobra.</p></div>
          <div className="owner">
            <div className="entry-seg">
              <button onClick={() => { setErr(""); setVista("dueno"); }}>Entrar</button>
              <button className="on">Primera vez</button>
            </div>
            <p className="hint">Pega el <b>enlace</b> o el <b>token</b> que te dio el dueño en su panel, y la tasa del dólar de hoy.</p>
            <label>Token de la caja
              <input className="inp" value={cajaTok} onChange={(e) => setCajaTok(e.target.value)} placeholder="Pegado del panel del dueño" onKeyDown={(e) => { if (e.key === "Enter" && cajaTok.trim()) guardarConfig(); }} />
            </label>
            <label>Tasa BCV del día <span style={{ color: "var(--ok)", fontWeight: 600 }}>· automática</span>
              <input className="inp" value={tasa} onChange={(e) => setTasaLocal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && cajaTok.trim()) guardarConfig(); }} />
            </label>
            <p className="hint" style={{ marginTop: -6 }}>Se actualiza sola con el BCV. Solo cámbiala si no tienes internet.</p>
            {aviso && !err && <p className="pinmsg err" role="alert">{aviso}</p>}
            {err && <p className="pinmsg err">{err}</p>}
            <button className="btn primary" onClick={guardarConfig} disabled={!cajaTok.trim() || guardando}>{guardando ? "Verificando…" : "Guardar y continuar"}</button>
            <AyudaWhatsApp />
          </div>
        </main>
      </div></div>
    );
  }

  if (vista === "dueno") {
    return (
      <div className="app"><div className="entrar">{side}
        <main className="entrar-main">
          <div className="entrar-head"><h1>{saludoHora()}</h1><p>Entra a tu negocio con tu correo, desde cualquier dispositivo</p></div>
          <div className="owner">
            <div className="entry-seg">
              <button className="on">Entrar</button>
              <button onClick={() => { setErr(""); setVista("config"); }}>Primera vez</button>
            </div>
            <label>Correo
              <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </label>
            <label>Contraseña
              <input className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" onKeyDown={(e) => { if (e.key === "Enter" && email && pass) entrarDueno(); }} />
            </label>
            {ok && <p className="pinmsg ok">{ok}</p>}
            {aviso && !err && <p className="pinmsg err" role="alert">{aviso}</p>}
            {err && <p className="pinmsg err">{err}</p>}
            <button className="btn primary" onClick={entrarDueno} disabled={!email || !pass}>Entrar</button>
            <button className="link" onClick={() => { setErr(""); setOk(""); setVista("olvide"); }}>¿Olvidaste tu contraseña?</button>
            {getCajaToken() && <button className="link" onClick={() => { setErr(""); setVista("pin"); }}>Volver a los cajeros</button>}
            <button className="link" onClick={() => { setErr(""); setEmail(""); setPass(""); setVista("admin"); }}>Soy el administrador</button>
            {(opc.registro || opc.demo) && (
              <div className="reg-cta">
                <div><b>¿Tu bodega aún no tiene cuenta?</b><span>{opc.registro ? "Créala tú mismo en un minuto. 7 días gratis, sin tarjeta." : "Mira cómo funciona con una bodega de muestra."}</span></div>
                <div className="reg-cta-acc">
                  {opc.demo && <button className="btn outline press" disabled={abriendoDemo} onClick={probarDemo}>{abriendoDemo ? "Preparando…" : "Ver la demo"}</button>}
                  {opc.registro && <button className="btn primary press" onClick={() => { setErr(""); setOk(""); setPass(""); setPass2(""); setVista("registro"); }}>Crear mi cuenta</button>}
                </div>
              </div>
            )}
            <AyudaWhatsApp />
          </div>
        </main>
      </div></div>
    );
  }

  if (vista === "registro") {
    return (
      <div className="app"><div className="entrar">{side}
        <main className="entrar-main">
          <div className="entrar-head"><h1>Crea la cuenta de tu bodega</h1><p>En un minuto estás vendiendo. <b>7 días gratis</b>, sin tarjeta.</p></div>
          <form className="owner reg-form" onSubmit={(e) => { e.preventDefault(); registrar(); }}>
            <label>Nombre de tu bodega o negocio
              <input id="reg-negocio" className="inp" value={negocio} autoFocus onChange={(e) => setNegocio(e.target.value)} placeholder="Ej: Bodega La Esquina" autoComplete="organization" />
            </label>
            <div className="reg-two">
              <label>Tu nombre
                <input id="reg-nombre" className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: María Pérez" autoComplete="name" />
              </label>
              <label>WhatsApp <span className="opt">(opcional)</span>
                <input id="reg-tel" className="inp" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="0412-0000000" autoComplete="tel" />
              </label>
            </div>
            <label>Correo (con él vas a entrar)
              <input id="reg-email" className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <div className="reg-two">
              <label>Contraseña
                <input id="reg-pass" className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
              </label>
              <label>Repítela
                <input id="reg-pass2" className="inp" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
              </label>
            </div>
            {pass.length > 0 && pass.length < 8 && <p className="hint">Mínimo 8 caracteres (faltan {8 - pass.length})</p>}
            {pass2.length > 0 && pass !== pass2 && <p className="hint" style={{ color: "var(--bad)" }}>Las dos contraseñas no coinciden</p>}
            {email.trim() && !correoOk && <p className="hint">Revisa el correo</p>}
            {err && <p className="pinmsg err" role="alert">{err}</p>}
            <button type="submit" className="btn primary" disabled={!registroListo}>{enviando ? "Creando tu cuenta…" : "Crear mi cuenta gratis"}</button>
            <p className="hint reg-legal">Después podrás crear tus cajas y cajeros desde tu cuenta, sin tokens ni enredos.</p>
            <button type="button" className="link" onClick={() => { setErr(""); setPass(""); setPass2(""); setVista("dueno"); }}>Ya tengo cuenta, quiero entrar</button>
            <AyudaWhatsApp mensaje="Hola, quiero crear la cuenta de mi bodega en KioskPOS y tengo una pregunta." />
          </form>
        </main>
      </div></div>
    );
  }

  if (vista === "olvide") {
    const volver = () => { setErr(""); setOk(""); setPass(""); setPass2(""); setCodigoRec(""); setCodigoNuevo(""); setPorCorreo(false); setVista("dueno"); };
    if (codigoNuevo) {
      return (
        <div className="app"><div className="entrar">{side}
          <main className="entrar-main">
            <div className="entrar-head"><h1>¡Listo, clave nueva!</h1><p>El código que usaste ya no sirve. Este es tu código nuevo: guárdalo.</p></div>
            <div className="owner">
              <CodigoRecuperacion codigo={codigoNuevo} />
              {err && <p className="pinmsg err">{err}</p>}
              <button className="btn primary" onClick={async () => { try { onLogin(await loginDueno(email.trim(), pass)); } catch (e) { setErr((e as Error).message); } }}>Entrar a mi negocio</button>
            </div>
          </main>
        </div></div>
      );
    }
    if (porCorreo) {
      return (
        <div className="app"><div className="entrar">{side}
          <main className="entrar-main">
            <div className="entrar-head"><h1>Enlace por correo</h1><p>Te mandamos un enlace a tu correo para poner una clave nueva</p></div>
            <div className="owner">
              <label>Correo con el que entras
                <input className="inp" type="email" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} autoComplete="username"
                  onKeyDown={(e) => { if (e.key === "Enter" && email.includes("@")) pedirEnlace(); }} />
              </label>
              {ok && <p className="pinmsg ok">{ok} Revisa también la carpeta de spam. El enlace vence en 30 minutos.</p>}
              {err && <p className="pinmsg err">{err}</p>}
              <button className="btn primary" onClick={pedirEnlace} disabled={!email.includes("@") || enviando}>{enviando ? "Enviando…" : ok ? "Enviar otra vez" : "Enviarme el enlace"}</button>
              <button className="link" onClick={() => { setErr(""); setOk(""); setPorCorreo(false); }}>Mejor uso mi código</button>
            </div>
          </main>
        </div></div>
      );
    }
    const listo = email.includes("@") && codigoRec.replace(/[^A-Za-z0-9]/g, "").length >= 12 && pass.length >= 8 && pass === pass2 && !enviando;
    return (
      <div className="app"><div className="entrar">{side}
        <main className="entrar-main">
          <div className="entrar-head"><h1>¿Olvidaste tu contraseña?</h1><p>Pon una nueva con tu <b>código de recuperación</b> (el que te dimos al crear la cuenta)</p></div>
          <form className="owner" onSubmit={(e) => { e.preventDefault(); if (listo) recuperar(); }}>
            <label>Correo con el que entras
              <input id="rec-email" className="inp" type="email" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </label>
            <label>Código de recuperación
              <input id="rec-codigo" className="inp t rec-input" value={codigoRec} onChange={(e) => setCodigoRec(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false} />
            </label>
            <div className="reg-two">
              <label>Contraseña nueva
                <input id="rec-pass" className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
              </label>
              <label>Repítela
                <input id="rec-pass2" className="inp" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
              </label>
            </div>
            {pass.length > 0 && pass.length < 8 && <p className="hint">Mínimo 8 caracteres (faltan {8 - pass.length})</p>}
            {pass2.length > 0 && pass !== pass2 && <p className="hint" style={{ color: "var(--bad)" }}>Las dos contraseñas no coinciden</p>}
            {err && <p className="pinmsg err" role="alert">{err}</p>}
            <button type="submit" className="btn primary" disabled={!listo}>{enviando ? "Guardando…" : "Poner contraseña nueva"}</button>
            <div className="rec-sin">
              <b>¿No tienes el código?</b>
              <AyudaWhatsApp boton texto="Pídenos ayuda por WhatsApp" mensaje={"Hola, olvidé mi contraseña de KioskPOS." + (email.includes("@") ? " Mi correo es " + email.trim() + "." : "")} />
              {opc.correo && <button type="button" className="link" onClick={() => { setErr(""); setOk(""); setPorCorreo(true); }}>Enviarme un enlace al correo</button>}
            </div>
            <button type="button" className="link" onClick={volver}>Volver</button>
          </form>
        </main>
      </div></div>
    );
  }

  if (vista === "reset") {
    return (
      <div className="app"><div className="entrar">{side}
        <main className="entrar-main">
          <div className="entrar-head"><h1>Contraseña nueva</h1><p>Escríbela dos veces. Mínimo 8 caracteres.</p></div>
          <div className="owner">
            <label>Contraseña nueva
              <input className="inp" type="password" value={pass} autoFocus onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
            </label>
            <label>Repítela
              <input className="inp" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === "Enter" && pass && pass2) ponerClave(); }} />
            </label>
            {pass.length > 0 && pass.length < 8 && <p className="hint">Faltan {8 - pass.length} caracteres</p>}
            {aviso && !err && <p className="pinmsg err" role="alert">{aviso}</p>}
            {err && <p className="pinmsg err">{err}</p>}
            <button className="btn primary" onClick={ponerClave} disabled={!pass || !pass2 || enviando}>{enviando ? "Guardando…" : "Guardar contraseña"}</button>
            <button className="link" onClick={() => { setErr(""); setPass(""); setPass2(""); setVista("dueno"); }}>Cancelar</button>
          </div>
        </main>
      </div></div>
    );
  }

  if (vista === "admin") {
    return (
      <div className="app"><div className="entrar">{side}
        <main className="entrar-main">
          <div className="entrar-head"><h1>Panel de administración</h1><p>Acceso de super admin</p></div>
          <div className="owner">
            <label>Correo<input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Contraseña<input className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && email && pass) entrarAdmin(); }} /></label>
            {pide2fa && (
              <label>Código de tu app de autenticación
                <input className="inp t codigo2fa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus
                  value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Código de 6 dígitos"
                  onKeyDown={(e) => { if (e.key === "Enter" && codigo.length === 6) entrarAdmin(); }} />
              </label>
            )}
            {aviso && !err && <p className="pinmsg err" role="alert">{aviso}</p>}
            {err && <p className="pinmsg err">{err}</p>}
            <button className="btn primary" onClick={entrarAdmin} disabled={!email || !pass || (pide2fa && codigo.length !== 6)}>Entrar</button>
            <button className="link" onClick={() => { setErr(""); setPide2fa(false); setCodigo(""); setVista("dueno"); }}>Volver</button>
          </div>
        </main>
      </div></div>
    );
  }

  return (
    <div className="app"><div className="entrar">{side}
      <main className="entrar-main">
        <div className="entrar-head"><h1>¿Quién va a cobrar?</h1><p>Toca tu nombre y escribe tu PIN de 4 dígitos<span className="kbtip">← → elige · teclea el PIN</span></p></div>
        {aviso && !err && <p className="pinmsg err" role="alert">{aviso}</p>}
            {err && <p className="pinmsg err">{err}</p>}
        <div className="personas">
          {cajeros.map((c, i) => (
            <button key={c.id} className="persona" aria-pressed={sel?.id === c.id}
              onClick={() => { setSel(c); setPin(""); setPinErr(""); }}>
              <span className="pav" style={{ ["--av" as string]: AV_COLORES[i % AV_COLORES.length] }}>
                {c.nombre.charAt(0).toUpperCase()}
              </span>
              <span className="pnom">{c.nombre.split(" ")[0]}</span>
            </button>
          ))}
          <button className="persona" onClick={() => { setErr(""); setVista("dueno"); }}>
            <span className="pav" style={{ ["--av" as string]: "var(--c-chucherias)" }}>D</span>
            <span className="pnom">Dueño</span>
          </button>
        </div>
        {sel && (
          <>
            <div className={"pins" + (shake ? " shake" : "")}>
              {[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? "on" : ""} />)}
            </div>
            <div className={"pinmsg" + (pinErr ? " err" : "")}>{pinErr || "Escribe tu PIN de 4 dígitos"}</div>
            <div className="rpad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} className="rk t press" onClick={() => tecla(d)}>{d}</button>
              ))}
              <button className="rk fn" onClick={() => tecla("clr")}>Borrar</button>
              <button className="rk t press" onClick={() => tecla("0")}>0</button>
              <button className="rk fn" aria-label="Borrar un dígito" onClick={() => tecla("del")}><UIcono k="del" /></button>
            </div>
          </>
        )}
        {cajeros.length === 0 && !err && <p className="pinmsg">Cargando cajeros…</p>}
        {err && (
          <button className="owner-pill" onClick={() => { setErr(""); setVista("config"); }}>
            <UIcono k="plus" />Configurar este equipo como caja
          </button>
        )}
        <button className="owner-pill" onClick={() => { setErr(""); setVista("dueno"); }}>
          <UIcono k="user" />¿Eres el dueño? Entra con tu correo
        </button>
        <AyudaWhatsApp />
      </main>
    </div></div>
  );
}
