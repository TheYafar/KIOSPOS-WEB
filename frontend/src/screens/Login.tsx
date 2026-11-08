import { useCallback, useEffect, useState } from "react";
import { adminLogin, listarCajeros, loginCajero, loginDueno, tasaBcvServidor, type Cajero } from "../api";
import { getCajaToken, getSesion, getTasa, setCajaToken, setTasa, type Sesion } from "../session";
import { UIcono } from "../icons";
import { TemaBtn } from "../TemaBtn";

type Vista = "config" | "pin" | "dueno" | "admin";

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
  const [vista, setVista] = useState<Vista>(getCajaToken() ? "pin" : "dueno");
  const [cajeros, setCajeros] = useState<Cajero[]>([]);
  const [sel, setSel] = useState<Cajero | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [shake, setShake] = useState(false);
  const [reloj, setReloj] = useState(new Date());

  const [cajaTok, setCajaTok] = useState(getCajaToken());
  const [tasa, setTasaLocal] = useState(getTasa());
  const [guardando, setGuardando] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Tasa BCV automática: prellenar con la del servidor (el cajero no la escribe).
  useEffect(() => {
    tasaBcvServidor().then((t) => { if (t.bs) { setTasa(String(t.bs)); setTasaLocal(String(t.bs)); } }).catch(() => { /* usa la última */ });
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
    } catch {
      setPinErr("PIN incorrecto. Intenta de nuevo.");
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

  const entrarDueno = async () => {
    try {
      onLogin(await loginDueno(email.trim(), pass));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const entrarAdmin = async () => {
    try {
      await adminLogin(email.trim(), pass);
      const s = getSesion();
      if (s) onLogin(s);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const fecha = reloj.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
  const hora = reloj.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });

  const side = (
    <aside className="entrar-side">
      <i className="deco" style={{ left: "55%", top: "-110px", width: 360, height: 360, background: "var(--nav-active)" }} />
      <i className="deco" style={{ left: "60%", top: "62%", width: 260, height: 260, background: "var(--primary)", opacity: .3 }} />
      <i className="deco" style={{ left: "-70px", top: "70%", width: 180, height: 180, background: "var(--nav-active)", opacity: .7 }} />
      <div className="entrar-brand"><span className="logo">K</span><b>KioskPOS</b></div>
      <TemaBtn className="entrar-tema" />
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
              <input className="inp" value={cajaTok} onChange={(e) => setCajaTok(e.target.value)} placeholder="Pegado del panel del dueño" />
            </label>
            <label>Tasa BCV del día <span style={{ color: "var(--ok)", fontWeight: 600 }}>· automática</span>
              <input className="inp" value={tasa} onChange={(e) => setTasaLocal(e.target.value)} />
            </label>
            <p className="hint" style={{ marginTop: -6 }}>Se actualiza sola con el BCV. Solo cámbiala si no tienes internet.</p>
            {err && <p className="pinmsg err">{err}</p>}
            <button className="btn primary" onClick={guardarConfig} disabled={!cajaTok.trim() || guardando}>{guardando ? "Verificando…" : "Guardar y continuar"}</button>
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
              <input className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
            </label>
            {err && <p className="pinmsg err">{err}</p>}
            <button className="btn primary" onClick={entrarDueno} disabled={!email || !pass}>Entrar</button>
            {getCajaToken() && <button className="link" onClick={() => { setErr(""); setVista("pin"); }}>Volver a los cajeros</button>}
            <button className="link" onClick={() => { setErr(""); setEmail(""); setPass(""); setVista("admin"); }}>Soy el administrador</button>
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
            <label>Contraseña<input className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
            {err && <p className="pinmsg err">{err}</p>}
            <button className="btn primary" onClick={entrarAdmin} disabled={!email || !pass}>Entrar</button>
            <button className="link" onClick={() => { setErr(""); setVista("dueno"); }}>Volver</button>
          </div>
        </main>
      </div></div>
    );
  }

  return (
    <div className="app"><div className="entrar">{side}
      <main className="entrar-main">
        <div className="entrar-head"><h1>¿Quién va a cobrar?</h1><p>Toca tu nombre y escribe tu PIN de 4 dígitos</p></div>
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
      </main>
    </div></div>
  );
}
