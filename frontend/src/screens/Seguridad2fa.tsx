import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { admin2fa, admin2faActivar, admin2faDesactivar, admin2faIniciar } from "../api";
import { UIcono } from "../icons";

/** QR en SVG (sin red: se genera aquí mismo). */
function Qr({ texto }: { texto: string }) {
  const svg = useMemo(() => { const q = qrcode(0, "M"); q.addData(texto); q.make(); return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }, [texto]);
  return <div className="qr2fa" role="img" aria-label="Código QR para la app de autenticación" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Verificación en dos pasos del super admin (Google Authenticator, Authy...). */
export function Seguridad2fa({ onClose, onCambio }: { onClose: () => void; onCambio: (activo: boolean) => void }) {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [ini, setIni] = useState<{ secreto: string; uri: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [err, setErr] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { admin2fa().then((r) => setActivo(r.activo)).catch((e) => setErr((e as Error).message)); }, []);

  const correr = async (fn: () => Promise<void>) => {
    setOcupado(true); setErr("");
    try { await fn(); } catch (e) { setErr((e as Error).message); setCodigo(""); } finally { setOcupado(false); }
  };
  const empezar = () => correr(async () => setIni(await admin2faIniciar()));
  const activar = () => correr(async () => { await admin2faActivar(codigo); setActivo(true); setIni(null); setCodigo(""); onCambio(true); });
  const desactivar = () => correr(async () => { await admin2faDesactivar(codigo); setActivo(false); setCodigo(""); onCambio(false); });
  const campo = (accion: () => void) => (
    <label className="lbl">Código de 6 dígitos que muestra la app
      <input className="inp t codigo2fa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus
        value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Código de 6 dígitos"
        onKeyDown={(e) => { if (e.key === "Enter" && codigo.length === 6) accion(); }} />
    </label>
  );

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Verificación en dos pasos</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          {activo === null && !err && <span className="hint">Cargando…</span>}
          {activo === true && (
            <>
              <div className="sec-ok"><UIcono k="check" sw={2.5} /><div><b>Activada</b><span>Al entrar se pide tu clave y el código de la app.</span></div></div>
              <span className="hint">Para desactivarla escribe un código actual de la app.</span>
              {campo(desactivar)}
            </>
          )}
          {activo === false && !ini && (
            <>
              <span className="hint">Protege el panel aunque alguien sepa tu clave: al entrar te pedirá también un código de 6 dígitos que cambia cada 30 segundos en tu teléfono.</span>
              <ol className="sec-pasos">
                <li>Instala <b>Google Authenticator</b> o <b>Authy</b> en tu teléfono.</li>
                <li>Toca “Empezar” y escanea el código QR.</li>
                <li>Escribe el código que te muestra la app.</li>
              </ol>
            </>
          )}
          {activo === false && ini && (
            <>
              <div className="sec-qr">
                <Qr texto={ini.uri} />
                <div className="sec-man">
                  <span className="hint">¿No puedes escanear? Escribe esta clave en la app:</span>
                  <code className="t">{ini.secreto.replace(/(.{4})/g, "$1 ").trim()}</code>
                </div>
              </div>
              {campo(activar)}
            </>
          )}
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="modal-foot">
          {activo === false && !ini && <button className="btn primary big press" disabled={ocupado} onClick={empezar}>Empezar</button>}
          {activo === false && ini && <button className="btn primary big press" disabled={ocupado || codigo.length !== 6} onClick={activar}>Activar</button>}
          {activo === true && <button className="btn danger big press" disabled={ocupado || codigo.length !== 6} onClick={desactivar}>Desactivar</button>}
        </div>
      </div>
    </div>
  );
}
