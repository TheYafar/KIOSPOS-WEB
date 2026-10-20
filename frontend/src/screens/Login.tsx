import { useCallback, useEffect, useState } from "react";
import { listarCajeros, loginCajero, loginDueno, type Cajero } from "../api";
import { getCajaToken, getTasa, setCajaToken, setTasa, type Sesion } from "../session";

type Vista = "config" | "pin" | "dueno";

/** Pantalla de entrada: configurar caja, PIN de cajero o correo del dueño. */
export function Login({ onLogin }: { onLogin: (s: Sesion) => void }) {
  const [vista, setVista] = useState<Vista>(getCajaToken() ? "pin" : "config");
  const [cajeros, setCajeros] = useState<Cajero[]>([]);
  const [sel, setSel] = useState<Cajero | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);

  // config
  const [cajaTok, setCajaTok] = useState(getCajaToken());
  const [tasa, setTasaLocal] = useState(getTasa());

  // dueño
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

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

  const tecla = async (d: string) => {
    if (!sel) {
      return;
    }
    const nuevo = (pin + d).slice(0, 6);
    setPin(nuevo);
    if (nuevo.length >= 4 && d !== "") {
      // intenta con 4; si el PIN es más largo el usuario sigue, pero probamos al llegar a 4-6
    }
  };

  const confirmarPin = async () => {
    if (!sel) {
      return;
    }
    try {
      const s = await loginCajero(sel.id, pin);
      onLogin(s);
    } catch (e) {
      setErr((e as Error).message);
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 350);
    }
  };

  const entrarDueno = async () => {
    try {
      onLogin(await loginDueno(email.trim(), pass));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (vista === "config") {
    return (
      <div className="app">
        <div className="lock">
          <div className="lock-brand"><span className="logo">K</span> KioskPOS</div>
          <p className="pinmsg">Configura esta caja (una sola vez)</p>
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
      </div>
    );
  }

  if (vista === "dueno") {
    return (
      <div className="app">
        <div className="lock">
          <div className="lock-brand"><span className="logo">K</span> KioskPOS</div>
          <div className="owner">
            <label>Correo
              <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>Contraseña
              <input className="inp" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
            </label>
            {err && <p className="pinmsg err">{err}</p>}
            <button className="btn" onClick={entrarDueno} disabled={!email || !pass}>Entrar</button>
            <button className="link" onClick={() => { setErr(""); setVista(getCajaToken() ? "pin" : "config"); }}>
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // pin
  return (
    <div className="app">
      <div className="lock">
        <div className="lock-brand"><span className="logo">K</span> KioskPOS</div>
        {cajeros.length === 0 && !err && <p className="pinmsg">Cargando cajeros…</p>}
        {err && <p className="pinmsg err">{err}</p>}
        <div className="people">
          {cajeros.map((c) => (
            <button key={c.id} className="person" aria-pressed={sel?.id === c.id}
              onClick={() => { setSel(c); setPin(""); setErr(""); }}>
              <span className="av">{c.nombre.charAt(0).toUpperCase()}</span>
              {c.nombre.split(" ")[0]}
            </button>
          ))}
        </div>
        {sel && (
          <>
            <div className={"dots" + (shake ? " shake" : "")}>
              {[0, 1, 2, 3].map((i) => <i key={i} className={i < pin.length ? "on" : ""} />)}
            </div>
            <div className="rpad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} className="rk" onClick={() => tecla(d)}>{d}</button>
              ))}
              <button className="rk fn" onClick={() => setPin("")}>Borrar</button>
              <button className="rk" onClick={() => tecla("0")}>0</button>
              <button className="rk fn" onClick={confirmarPin} disabled={pin.length < 4}>OK</button>
            </div>
          </>
        )}
        <button className="link" onClick={() => setVista("dueno")}>Entrar como dueño</button>
      </div>
    </div>
  );
}
