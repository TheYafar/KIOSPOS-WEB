import { getDemo, horasDemo, salirDemo } from "../demo";
import { setSesion, type Sesion } from "../session";
import { linkWhatsApp } from "../soporte";

/** Barra fija mientras se prueba la demo: cambiar de papel, crear la cuenta real, preguntar o salir. */
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
        <span className="demo-tag">DEMO</span>
        <span className="demo-msg">
          <b>Bodega de muestra</b>
          <span>{comoCajera ? "Vendes como la cajera Ana (PIN 1234)" : "La ves como dueño"}{h ? ` · quedan ${h} h` : ""}</span>
        </span>
      </div>
      <div className="demo-acc">
        <button className="demo-b sec" onClick={cambiar}>{comoCajera ? "Ver como dueño" : "Vender como cajera"}</button>
        <button className="demo-b pri" onClick={crearCuenta}><span className="l-larga">Crear mi cuenta gratis</span><span className="l-corta">Crear cuenta</span></button>
        <a className="demo-b ws" href={linkWhatsApp("Hola, estoy probando la demo de KioskPOS y tengo una pregunta.")} target="_blank" rel="noopener noreferrer" aria-label="Preguntar por WhatsApp" title="Preguntar por WhatsApp">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.6-5.4A8.5 8.5 0 1 1 21 11.5Z" /><path d="M8.5 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.5 1-1l-1.5-1-1 .7c-1-.4-1.8-1.2-2.2-2.2l.7-1-1-1.5c-.5 0-1 .4-1 1Z" /></svg>
        </a>
        <button className="demo-b ghost" onClick={salir}>Salir</button>
      </div>
    </div>
  );
}
