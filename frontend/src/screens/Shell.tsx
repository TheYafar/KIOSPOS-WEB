import { useEffect, useState } from "react";
import { type Sesion } from "../session";
import { UIcono } from "../icons";
import { Caja } from "./Caja";
import { Cuadre } from "./Cuadre";
import { Inventario } from "./Inventario";
import { Reportes } from "./Reportes";

interface Tab { id: string; n: string; icon: string; }

/** Armazón responsive: riel lateral en escritorio, pestañas abajo en móvil. */
export function Shell({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const esCaja = sesion.cajaId != null;
  const tabs: Tab[] = esCaja
    ? [{ id: "caja", n: "Caja", icon: "cart" }, { id: "cuadre", n: "Cuadre", icon: "cash" }, { id: "mas", n: "Más", icon: "more" }]
    : [{ id: "reportes", n: "Reportes", icon: "chart" }, { id: "inventario", n: "Inventario", icon: "box" }, { id: "mas", n: "Más", icon: "more" }];
  const [tab, setTab] = useState(tabs[0].id);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  return (
    <div className="app">
      <div className="shell">
        <nav className="rail" aria-label="Menú">
          <span className="logo">K</span>
          {tabs.map((t) => (
            <button key={t.id} className="rail-item" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <UIcono k={t.icon} />{t.n}
            </button>
          ))}
        </nav>
        <div className="appmain">
          <header className="hdr">
            <div>
              <h1>{tabs.find((t) => t.id === tab)?.n || "Más"}</h1>
              <div className="sub">{sesion.nombre}</div>
            </div>
            <span className="chip"><span className={"live" + (online ? "" : " off")} />{online ? "En línea" : "Sin conexión"}</span>
          </header>

          {tab === "caja" && esCaja && <Caja />}
          {tab === "cuadre" && esCaja && <Cuadre />}
          {tab === "reportes" && <Reportes />}
          {tab === "inventario" && <Inventario />}
          {tab === "mas" && (
            <div className="stub"><b>Más</b><p>Ajustes, usuarios y más saldrán aquí.</p><button className="btn ghost" onClick={onSalir}>Cerrar sesión</button></div>
          )}
        </div>
      </div>

      <nav className="tabbar" aria-label="Menú">
        {tabs.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            <span className="tab-i"><UIcono k={t.icon} /></span>{t.n}
          </button>
        ))}
      </nav>
    </div>
  );
}
