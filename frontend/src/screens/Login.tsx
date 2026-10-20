import { useCallback, useEffect, useState } from "react";
import { listarCajeros, loginCajero, loginDueno, type Cajero } from "../api";
import { getCajaToken, getTasa, setCajaToken, setTasa, type Sesion } from "../session";

type Vista = "config" | "pin" | "dueno";

const AV_COLORES = [
  "var(--c-bebidas)", "var(--c-limpieza)", "var(--c-chucherias)",
  "var(--c-viveres)", "var(--c-charcuteria)", "var(--c-panaderia)"
];

const ICONO_BORRAR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7Z" />
    <path d="m12 9.5 5 5M17 9.5l-5 5" />
  </svg>
);

function saludoHora(): string {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Pantalla de entrada fiel al mockup: panel con reloj + "¿Quién va a cobrar?" con PIN. */
export function Login({ onLogin }: { onLogin: (s: Sesion) => void }) {
  const [vista, setVista] = useState<Vista>(getCajaToken() ? "pin" : "config");
  const [cajeros, setCajeros] = useState<Cajero[]>([]);
  const [sel, setSel] = useState<Cajero | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [pinErr, setPinErr] = useState("");
  const [shake, setShake] = useState(false);
  const [reloj, setReloj] = useState(new Date());

  const [cajaTok, setCajaTok] = useState(getCajaToken());
  const [tasa, setTasaLocal] = useState(getTasa());
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(t);
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

  const guardarConfig = () => {
    setCajaToken(cajaTok.trim());
    setTasa(tasa.trim());
    setVista("pin");
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

  const fecha = reloj.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
  const hora = reloj.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });

  const panel = (
    <div className="lock-l">
      <div className="lock-brand"><span className="logo">K</span> KioskPOS</div>
      <div className="lock-clock t">{hora}</div>
      <div className="lock-date">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</div>
      <div className="lock-shop">
        <b>Caja registrada</b><br />
        Tasa BCV de hoy: Bs <span className="t">{getTasa()}</span>
      </div>
    </div>
  );

  if (vista === "config") {
    return (
      <div className="app"><div className="lock">{panel}
        <div className="lock-r">
          <div className="lock-q">Configura esta caja</div>
          <div className="owner">
            <label>Token de la caja
              <input className="inp" value={cajaTok} onChange={(e) => setCajaTok(e.target.value)} placeholder="Pegado del panel del dueño" />
            </label>
            <label>Tasa BCV del día
              <input className="inp" value={tasa} onChange={(e) => setTasaLocal(e.target.value)} />
            </label>
            <button className="btn" onClick={guardarConfig} disabled={!cajaTok.trim()}>Guardar</button>
            <button className="link" onClick={() => setVista("dueno")}>Entrar como dueño</button>
          </div>
        </div>
      </div></div>
    );
  }

  if (vista === "dueno") {
    return (
      <div className="app"><div className="lock">{panel}
        <div className="lock-r">
          <div className="lock-q">{saludoHora()}</div>
          <div className="owner">
            <label>Correo
              <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </label>
            <label>Contraseña
              <input className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
            </label>
            {err && <p className="pinmsg err">{err}</p>}
            <button className="btn" onClick={entrarDueno} disabled={!email || !pass}>Entrar</button>
            <button className="link" onClick={() => { setErr(""); setVista(getCajaToken() ? "pin" : "config"); }}>Volver</button>
          </div>
        </div>
      </div></div>
    );
  }

  return (
    <div className="app"><div className="lock">{panel}
      <div className="lock-r">
        <div className="lock-q">¿Quién va a cobrar?</div>
        {err && <p className="pinmsg err">{err}</p>}
        <div className="people">
          {cajeros.map((c, i) => (
            <button key={c.id} className="person" aria-pressed={sel?.id === c.id}
              onClick={() => { setSel(c); setPin(""); setPinErr(""); }}>
              <span className="av" style={{ ["--av" as string]: AV_COLORES[i % AV_COLORES.length] }}>
                {c.nombre.charAt(0).toUpperCase()}
              </span>
              {c.nombre.split(" ")[0]}
            </button>
          ))}
          <button className="person" onClick={() => { setErr(""); setVista("dueno"); }}>
            <span className="av" style={{ ["--av" as string]: "var(--c-chucherias)" }}>D</span>
            Dueño
          </button>
        </div>
        {sel && (
          <>
            <div className={"dots" + (shake ? " shake" : "")}>
              {[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? "on" : ""} />)}
            </div>
            <div className={"pinmsg" + (pinErr ? " err" : "")}>{pinErr || "Escribe tu PIN de 4 dígitos"}</div>
            <div className="rpad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} className="rk t" onClick={() => tecla(d)}>{d}</button>
              ))}
              <button className="rk fn" onClick={() => tecla("clr")}>Borrar</button>
              <button className="rk t" onClick={() => tecla("0")}>0</button>
              <button className="rk fn" aria-label="Borrar un dígito" onClick={() => tecla("del")}>{ICONO_BORRAR}</button>
            </div>
          </>
        )}
        {cajeros.length === 0 && !err && <p className="pinmsg">Cargando cajeros…</p>}
      </div>
    </div></div>
  );
}
