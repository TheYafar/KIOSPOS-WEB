import { getDemo, horasDemo, salirDemo } from "../demo";
import { setSesion, type Sesion } from "../session";
import { linkWhatsApp } from "../soporte";

/** Barra fija mientras se prueba la demo: cambiar de papel, crear la cuenta real o salir. */
export function DemoBanner({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const d = getDemo();
  if (!d) return null;
  const comoCajera = sesion.cajaId != null;
  const cambiar = () => { setSesion(comoCajera ? d.dueno : d.cajero); window.location.hash = comoCajera ? "#/reportes" : "#/caja"; window.location.reload(); };
  const crearCuenta = () => { salirDemo(); try { sessionStorage.setItem("kp_ir_registro", "1"); } catch { /* ignore */ } onSalir(); };
  const salir = () => { salirDemo(); onSalir(); };
  const h = horasDemo();
  return (
    <div className="demo-bar" role="status">
      <div className="demo-tx">
        <b>Estás probando la DEMO</b>
        <span>{comoCajera ? "Vendes como la cajera Ana (PIN 1234)." : "Ves la bodega como su dueño."} Es una bodega de muestra solo para ti{h ? `, dura ${h} h más` : ""}.</span>
      </div>
      <div className="demo-acc">
        <button className="btn outline press" onClick={cambiar}>{comoCajera ? "Ver como dueño" : "Vender como cajera"}</button>
        <button className="btn primary press" onClick={crearCuenta}>Crear mi cuenta gratis</button>
        <a className="btn2 press demo-ws" href={linkWhatsApp("Hola, estoy probando la demo de KioskPOS y tengo una pregunta.")} target="_blank" rel="noopener noreferrer">Preguntar</a>
        <button className="link demo-salir" onClick={salir}>Salir de la demo</button>
      </div>
    </div>
  );
}
