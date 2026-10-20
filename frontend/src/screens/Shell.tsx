import { useEffect, useState } from "react";
import { type Sesion } from "../session";
import { Caja } from "./Caja";

/**
 * Armazón de la app: encabezado, pantalla activa y barra de pestañas abajo. Las
 * pestañas dependen del rol: una caja (cajero) cobra; un dueño ve reportes. Las
 * pantallas que aún no están hechas muestran "próximamente" (saldrán del mockup).
 */
export function Shell({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const esCaja = sesion.cajaId != null;
  const tabs = esCaja
    ? [{ id: "caja", n: "Caja" }, { id: "cuadre", n: "Cuadre" }, { id: "mas", n: "Más" }]
    : [{ id: "reportes", n: "Reportes" }, { id: "inventario", n: "Inventario" }, { id: "mas", n: "Más" }];
  const [tab, setTab] = useState(tabs[0].id);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <div className="app">
      <header className="hdr">
        <div>
          <h1>{titulo(tab)}</h1>
          <div className="sub">{sesion.nombre}</div>
        </div>
        <span className="chip">
          <span className={"live" + (online ? "" : " off")} />
          {online ? "En línea" : "Sin conexión"}
        </span>
      </header>

      {tab === "caja" && esCaja && <Caja />}
      {tab !== "caja" && (
        <div className="stub">
          <b>{titulo(tab)}</b>
          <p>Pantalla en construcción (saldrá del diseño del mockup).</p>
          <button className="btn ghost" onClick={onSalir}>Cerrar sesión</button>
        </div>
      )}

      <nav className="tabbar">
        {tabs.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            {t.n}
          </button>
        ))}
      </nav>
    </div>
  );
}

function titulo(tab: string): string {
  switch (tab) {
    case "caja": return "Caja";
    case "cuadre": return "Cuadre";
    case "reportes": return "Reportes";
    case "inventario": return "Inventario";
    default: return "Más";
  }
}
