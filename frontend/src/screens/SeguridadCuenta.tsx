import { useEffect, useState } from "react";
import { estadoRecuperacion, generarCodigoRecuperacion } from "../api";
import { AyudaWhatsApp, CodigoRecuperacion } from "./Ayuda";

/** En "Más": código de recuperación de la cuenta (sin correo) + ayuda por WhatsApp. */
export function SeguridadCuenta() {
  const [tiene, setTiene] = useState<boolean | null>(null);
  const [codigo, setCodigo] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [err, setErr] = useState("");
  const [yendo, setYendo] = useState(false);
  useEffect(() => { estadoRecuperacion().then((r) => setTiene(r.tiene)).catch(() => setTiene(null)); }, []);
  const generar = async () => {
    setYendo(true); setErr("");
    try { setCodigo(await generarCodigoRecuperacion()); setTiene(true); setConfirmar(false); }
    catch (e) { setErr((e as Error).message); }
    finally { setYendo(false); }
  };
  return (
    <section className="card seg-card">
      <div className="seg-h"><b>Seguridad de tu cuenta</b>
        <span>Si olvidas tu contraseña, la cambias tú mismo con tu correo y tu <b>código de recuperación</b>.</span></div>
      {codigo ? (
        <CodigoRecuperacion codigo={codigo} />
      ) : (
        <>
          <span className={"pill " + (tiene ? "ok" : "warn")} style={{ alignSelf: "flex-start" }}>{tiene ? "Tienes un código guardado" : tiene === false ? "Aún no tienes código" : "…"}</span>
          {tiene && !confirmar ? (
            <button className="btn2 press" onClick={() => setConfirmar(true)}>Hacer un código nuevo</button>
          ) : (
            <>
              {tiene && <span className="hint">El código anterior dejará de servir.</span>}
              <button className="btn primary press" disabled={yendo || tiene === null} onClick={generar}>{yendo ? "Generando…" : tiene ? "Sí, hacer uno nuevo" : "Crear mi código"}</button>
            </>
          )}
        </>
      )}
      {err && <p className="pinmsg err">{err}</p>}
      <div className="seg-ayuda"><AyudaWhatsApp /></div>
    </section>
  );
}
