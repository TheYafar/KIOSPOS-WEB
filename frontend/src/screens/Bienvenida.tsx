import { useState } from "react";
import { getSesion } from "../session";
import { UIcono } from "../icons";
import { cerrarBienvenida, esteEquipoEsCaja, usarEsteEquipoComoCaja } from "../esteEquipo";

/**
 * Bienvenida al sistema justo después de registrarse: saluda, recuerda la prueba gratis
 * y guía los 3 primeros pasos (cada uno se hace desde aquí o lleva a su pantalla).
 */
export function Bienvenida({ onIr, onCerrar }: { onIr: (tab: string) => void; onCerrar: () => void }) {
  const nombre = (getSesion()?.nombre || "").split(" ")[0];
  const [caja, setCaja] = useState(esteEquipoEsCaja());
  const [yendo, setYendo] = useState(false);
  const [err, setErr] = useState("");

  const cerrar = () => { cerrarBienvenida(); onCerrar(); };
  const ir = (tab: string) => { cerrar(); onIr(tab); };
  const usarEquipo = async () => {
    setYendo(true); setErr("");
    try { await usarEsteEquipoComoCaja("Caja 1"); setCaja(true); }
    catch (e) { setErr((e as Error).message); }
    finally { setYendo(false); }
  };

  return (
    <div className="modal bienv-modal" role="dialog" aria-label="Bienvenida a KioskPOS">
      <div className="modal-card bienv-card">
        <div className="bienv-hero">
          <span className="bienv-badge"><UIcono k="check" sw={2.6} /></span>
          <h2>¡Bienvenido a KioskPOS{nombre ? ", " + nombre : ""}!</h2>
          <p>Tu bodega ya tiene cuenta. Tienes <b>7 días gratis</b> para probarlo todo. Deja todo listo en 3 pasos:</p>
        </div>
        <div className="modal-body bienv-pasos">
          <div className={"bienv-paso" + (caja ? " hecho" : "")}>
            <span className="bienv-n">{caja ? <UIcono k="check" sw={2.6} /> : "1"}</span>
            <div className="bienv-tx">
              <b>{caja ? "Este equipo ya es tu caja" : "Cobra en este equipo"}</b>
              <span>{caja ? "Al salir de tu cuenta, aquí aparecerán tus cajeros para entrar con su PIN." : "Lo dejamos listo como caja con un toque, sin copiar códigos. ¿Vas a cobrar en otro equipo? Créala luego en Más → Equipo y cajas."}</span>
              {err && <span className="mg-bad">{err}</span>}
            </div>
            {!caja && <button className="btn primary press" disabled={yendo} onClick={usarEquipo}>{yendo ? "Listo…" : "Usar este equipo"}</button>}
          </div>
          <div className="bienv-paso">
            <span className="bienv-n">2</span>
            <div className="bienv-tx"><b>Agrega a tus cajeros</b><span>Cada uno entra con su nombre y un PIN de 4 dígitos.</span></div>
            <button className="btn outline press" onClick={() => ir("reportes")}>Agregar</button>
          </div>
          <div className="bienv-paso">
            <span className="bienv-n">3</span>
            <div className="bienv-tx"><b>Carga tus productos</b><span>Uno por uno o todos de una vez con un archivo de Excel (CSV).</span></div>
            <button className="btn outline press" onClick={() => ir("inventario")}>Cargar</button>
          </div>
        </div>
        <div className="modal-foot"><button className="btn primary big press" onClick={cerrar}>Empezar a usar KioskPOS</button></div>
      </div>
    </div>
  );
}
