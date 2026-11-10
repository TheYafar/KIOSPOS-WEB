import { useEffect, useState } from "react";
import { getTasa, type Sesion } from "../session";
import { turnoActual, type TurnoResumen } from "../api";
import { getBcv, metodoActivo } from "../config";
import { Configuracion } from "./Configuracion";
import { UIcono } from "../icons";
import { Caja } from "./Caja";
import { Contabilidad } from "./Contabilidad";
import { Cuadre } from "./Cuadre";
import { Inventario } from "./Inventario";
import { Reportes } from "./Reportes";
import { Usuarios } from "./Usuarios";
import { CierreAviso } from "./negocio";
import { TemaBtn } from "../TemaBtn";
import { Atajos } from "../Atajos";

interface Tab { id: string; n: string; icon: string; }

function saludo(): string {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Armazón responsive: riel lateral en escritorio, pestañas abajo en móvil. */
export function Shell({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const esCaja = sesion.cajaId != null;
  const tabs: Tab[] = esCaja
    ? [{ id: "caja", n: "Vender", icon: "cart" }, { id: "cuadre", n: "Cierre", icon: "cash" }, { id: "config", n: "Config.", icon: "config" }, { id: "mas", n: "Más", icon: "more" }]
    : [{ id: "reportes", n: "Reportes", icon: "chart" }, { id: "inventario", n: "Productos", icon: "box" }, { id: "contabilidad", n: "Cuentas", icon: "cash" }, { id: "config", n: "Config.", icon: "config" }, { id: "mas", n: "Más", icon: "more" }];
  const [tab, setTab] = useState(tabs[0].id);
  const [online, setOnline] = useState(navigator.onLine);
  const [ayuda, setAyuda] = useState(false);
  // Turno de la caja según el SERVIDOR: undefined = cargando, null = caja cerrada.
  const [turno, setTurno] = useState<TurnoResumen | null | undefined>(undefined);
  useEffect(() => {
    if (!esCaja) return;
    let vivo = true;
    const cargar = () => { turnoActual().then((t) => { if (vivo) setTurno(t && t.turnoId ? t : null); }).catch(() => { /* sin conexión */ }); };
    cargar();
    const id = setInterval(cargar, 60 * 1000);
    window.addEventListener("kp-turno", cargar);
    return () => { vivo = false; clearInterval(id); window.removeEventListener("kp-turno", cargar); };
  }, [esCaja]);

  // Teclado global: Alt+1..n cambia de pestaña, F1 muestra los atajos.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); setAyuda((v) => !v); return; }
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const t = tabs[Number(e.key) - 1];
        if (t) { e.preventDefault(); setTab(t.id); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

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
      {esCaja && <CierreAviso />}
      <div className="shell">
        <nav className="rail" aria-label="Menú">
          <span className="logo">K</span>
          {tabs.map((t, i) => (
            <button key={t.id} className="rail-item" title={t.n + " (Alt+" + (i + 1) + ")"} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
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
              {esCaja && turno !== undefined && (
                <button className={"hpill caja-est " + (turno ? "ab" : "ce")} onClick={() => setTab("cuadre")} title={turno ? "Caja abierta — ir al cierre" : "Caja cerrada — ábrela para vender"}>
                  <span className="dot" /><b>{turno ? "Caja abierta" : "Caja cerrada"}</b>{turno && <span className="t3">#{turno.turnoId}</span>}
                </button>
              )}
              <span className="hpill" title={getBcv() && String(getBcv()) !== getTasa() ? "BCV Bs " + getBcv() + " (con ajuste en Config.)" : "Tasa BCV automática"}><span className="t3">{getBcv() && String(getBcv()) !== getTasa() ? "Tasa" : "Tasa BCV"}</span><b className="t">Bs {getTasa()}</b></span>
              <span className={"hpill" + (online ? " ok" : "")}>
                <span className="dot" style={{ background: online ? "var(--ok)" : "var(--bad)" }} />
                <b>{online ? "En línea" : "Sin conexión"}</b>
              </span>
              <button className="tema-btn press atajos-btn" title="Atajos de teclado (F1)" aria-label="Atajos de teclado" onClick={() => setAyuda(true)}><UIcono k="teclado" sw={1.9} /></button>
              <TemaBtn />
            </div>
          </header>

          {tab === "caja" && esCaja && <Caja />}
          {tab === "cuadre" && esCaja && <Cuadre />}
          {tab === "reportes" && <Reportes onIr={setTab} />}
          {tab === "inventario" && <Inventario />}
          {tab === "contabilidad" && <Contabilidad />}
          {tab === "config" && <Configuracion />}
          {tab === "mas" && (esCaja
            ? <div className="stub"><b>Más</b><p>El manejo de usuarios y cajas lo hace el dueño desde su panel.</p><button className="btn ghost" onClick={onSalir}>Cerrar sesión</button></div>
            : <Usuarios onSalir={onSalir} />)}
          {esCaja && turno !== undefined && <TurnoBar turno={turno} onIr={() => setTab("cuadre")} />}
        </div>
      </div>

      {ayuda && <Atajos onClose={() => setAyuda(false)} />}
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

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Barra de abajo: lo cobrado en el turno por cada forma de pago activa. */
function TurnoBar({ turno, onIr }: { turno: TurnoResumen | null; onIr: () => void }) {
  if (!turno) {
    return (
      <div className="turno-bar ce">
        <span className="tb-st"><i />Caja cerrada</span>
        <span className="tb-msg">Ábrela para empezar a vender.</span>
        <button className="tb-btn press" onClick={onIr}>Abrir caja</button>
      </div>
    );
  }
  const dig = (m: string) => turno.metodos?.find((x) => x.metodo === m)?.esperado ?? 0;
  const items: { id: string; n: string; v: string; usd: number }[] = [];
  const tasa = Number(getTasa()) || 1;
  const add = (id: string, n: string, monto: number, moneda: "USD" | "VES") => {
    if (!metodoActivo(id) && monto === 0) return;
    items.push({ id, n, v: (moneda === "USD" ? "$ " : "Bs ") + money(monto), usd: moneda === "USD" ? monto : monto / tasa });
  };
  add("EFECTIVO_USD", "Efectivo $", turno.efectivoUsd, "USD");
  add("EFECTIVO_BS", "Efectivo Bs", turno.efectivoBs, "VES");
  add("PAGO_MOVIL", "Pago móvil", dig("PAGO_MOVIL"), "VES");
  add("PUNTO", "Punto", dig("PUNTO"), "VES");
  add("BIOPAGO", "Biopago", dig("BIOPAGO"), "VES");
  const total = items.reduce((s, x) => s + x.usd, 0);
  return (
    <div className="turno-bar ab" role="status" aria-label="Cobrado en el turno">
      <button className="tb-st press" onClick={onIr} title="Ir al cierre"><i />Turno #{turno.turnoId}</button>
      <div className="tb-items">
        {items.map((x) => <span key={x.id} className="tb-it"><small>{x.n}</small><b className="t">{x.v}</b></span>)}
      </div>
      <span className="tb-tot"><small>Total cobrado</small><b className="t">≈ $ {money(total)}</b></span>
    </div>
  );
}
