import { useEffect, useState } from "react";
import { getTasa, type Sesion } from "../session";
import { UIcono } from "../icons";
import { Caja } from "./Caja";
import { Contabilidad } from "./Contabilidad";
import { Cuadre } from "./Cuadre";
import { Inventario } from "./Inventario";
import { Reportes } from "./Reportes";
import { Usuarios } from "./Usuarios";

interface Tab { id: string; n: string; icon: string; }

function saludo(): string {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Armazón responsive: riel lateral en escritorio, pestañas abajo en móvil. */
export function Shell({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const esCaja = sesion.cajaId != null;
  const tabs: Tab[] = esCaja
    ? [{ id: "caja", n: "Vender", icon: "cart" }, { id: "cuadre", n: "Cierre", icon: "cash" }, { id: "mas", n: "Más", icon: "more" }]
    : [{ id: "reportes", n: "Reportes", icon: "chart" }, { id: "inventario", n: "Productos", icon: "box" }, { id: "contabilidad", n: "Cuentas", icon: "cash" }, { id: "mas", n: "Más", icon: "more" }];
  const [tab, setTab] = useState(tabs[0].id);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const nombre = sesion.nombre || "";
  const primerNombre = nombre.split(" ")[0] || nombre;
  const fecha = new Date().toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
  const inicial = (primerNombre.charAt(0) || "·").toUpperCase();

  return (
    <div className={"app" + (tab === "caja" ? " caja-app" : "")}>
      <div className="shell">
        <nav className="rail" aria-label="Menú">
          <span className="logo">K</span>
          {tabs.map((t) => (
            <button key={t.id} className="rail-item" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <UIcono k={t.icon} />{t.n}
            </button>
          ))}
          <span className="rail-sp" />
          <button className="rail-item" onClick={onSalir}><UIcono k="user" />Salir</button>
          <span className="rail-av" style={{ ["--av" as string]: "var(--c-bebidas)" }}>{inicial}</span>
        </nav>
        <div className="appmain">
          <header className="hdr">
            <div>
              <h1>{saludo()}, {primerNombre}</h1>
              <div className="sub">{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</div>
            </div>
            <div className="hpills">
              <span className="hpill"><span className="t3">Tasa BCV</span><b className="t">Bs {getTasa()}</b></span>
              <span className={"hpill" + (online ? " ok" : "")}>
                <span className="dot" style={{ background: online ? "var(--ok)" : "var(--bad)" }} />
                <b>{online ? "En línea" : "Sin conexión"}</b>
              </span>
            </div>
          </header>

          {tab === "caja" && esCaja && <Caja />}
          {tab === "cuadre" && esCaja && <Cuadre />}
          {tab === "reportes" && <Reportes onIr={setTab} />}
          {tab === "inventario" && <Inventario />}
          {tab === "contabilidad" && <Contabilidad />}
          {tab === "mas" && (esCaja
            ? <div className="stub"><b>Más</b><p>El manejo de usuarios y cajas lo hace el dueño desde su panel.</p><button className="btn ghost" onClick={onSalir}>Cerrar sesión</button></div>
            : <Usuarios onSalir={onSalir} />)}
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
