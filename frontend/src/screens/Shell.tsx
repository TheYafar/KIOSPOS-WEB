import { useEffect, useState } from "react";
import { getTasa, type Sesion } from "../session";
import { turnoActual, type Situacion, type TurnoResumen } from "../api";
import { cargarPlan, getPlan } from "../plan";
import { TamBtn } from "../TamBtn";
import { getBcv, metodoActivo } from "../config";
import { Configuracion } from "./Configuracion";
import { PanelCierresPunto } from "./CierresPunto";
import { Clientes } from "./Clientes";
import { Ventas } from "./Ventas";
import { Compras } from "./Compras";
import { Nomina } from "./Nomina";
import { UIcono } from "../icons";
import { Caja } from "./Caja";
import { Contabilidad } from "./Contabilidad";
import { Cuadre, diasAbierto } from "./Cuadre";
import { Inventario } from "./Inventario";
import { Reportes } from "./Reportes";
import { Usuarios } from "./Usuarios";
import { CierreAviso } from "./negocio";
import { TemaBtn } from "../TemaBtn";
import { Atajos } from "../Atajos";
import { ColaModal, ColaPill, useCola } from "./ColaVentas";
import { Campana } from "./Campana";
import { Bienvenida } from "./Bienvenida";
import { pideBienvenida } from "../esteEquipo";

interface Tab { id: string; n: string; icon: string; }

function saludo(): string {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Armazón responsive: riel lateral en escritorio, pestañas abajo en móvil. */
export function Shell({ sesion, onSalir }: { sesion: Sesion; onSalir: () => void }) {
  const esCaja = sesion.cajaId != null;
  const tabs: Tab[] = esCaja
    // El cajero solo ve lo de su caja: vender, cerrar y el historial para devoluciones.
    // Fiado, configuración, productos y lo demás es del dueño.
    ? [{ id: "caja", n: "Vender", icon: "cart" }, { id: "cuadre", n: "Cierre", icon: "cash" }, { id: "ventas", n: "Ventas", icon: "recibo" }]
    : [{ id: "reportes", n: "Reportes", icon: "chart" }, { id: "ventas", n: "Ventas", icon: "recibo" }, { id: "inventario", n: "Productos", icon: "box" }, { id: "contabilidad", n: "Cuentas", icon: "cash" }, { id: "fiado", n: "Crédito", icon: "user" }, { id: "nomina", n: "Nómina", icon: "equipo" }, { id: "config", n: "Config.", icon: "config" }, { id: "puntos", n: "Puntos", icon: "card" }, { id: "mas", n: "Más", icon: "more" }];
  // La pestaña vive en la URL (#/ventas, #/inventario…) para que el botón Atrás del
  // teléfono o del navegador vuelva a la pestaña anterior en vez de salir de la app.
  const tabDeUrl = () => {
    const m = window.location.hash.match(/^#\/([\w-]+)/);
    return m && tabs.some((t) => t.id === m[1]) ? m[1] : tabs[0].id;
  };
  const [tab, setTabEstado] = useState(tabDeUrl);
  const setTab = (id: string) => {
    setTabEstado(id);
    if (window.location.hash !== "#/" + id) history.pushState({ tab: id }, "", "#/" + id);
  };
  useEffect(() => {
    history.replaceState({ tab }, "", "#/" + tab);
    const alVolver = () => setTabEstado(tabDeUrl());
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [online, setOnline] = useState(navigator.onLine);
  const [ayuda, setAyuda] = useState(false);
  const [bienv, setBienv] = useState(() => !esCaja && pideBienvenida());
  // Ventas cobradas que aún no llegan al servidor (sin internet o rechazadas).
  const cola = useCola();
  const [verCola, setVerCola] = useState(false);
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

  // Plan de KioskPOS (al día / aviso / suspendido): al entrar, cada 5 min y al reconectar.
  const [plan, setPlan] = useState<Situacion | null>(getPlan());
  const [verSusp, setVerSusp] = useState(false);
  useEffect(() => {
    const leer = () => setPlan(getPlan());
    cargarPlan().then((p) => { if (p && !p.puedeCobrar) { try { if (!sessionStorage.getItem("kp_susp_visto")) setVerSusp(true); } catch { setVerSusp(true); } } });
    const id = setInterval(cargarPlan, 5 * 60 * 1000);
    window.addEventListener("kp-plan", leer);
    window.addEventListener("online", cargarPlan);
    return () => { clearInterval(id); window.removeEventListener("kp-plan", leer); window.removeEventListener("online", cargarPlan); };
  }, []);
  const irAPagar = () => { setVerSusp(false); try { sessionStorage.setItem("kp_susp_visto", "1"); } catch { /* */ } setTab("mas"); };

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
              <ColaPill cola={cola} onClick={() => setVerCola(true)} />
              {!esCaja && <Campana onIr={(t, sub) => { setTab(t); if (sub) setTimeout(() => window.dispatchEvent(new CustomEvent("kp-sub-productos", { detail: sub })), 0); }} />}
              <span className="hpill" title={getBcv() && String(getBcv()) !== getTasa() ? "BCV Bs " + getBcv() + " (con ajuste en Config.)" : "Tasa BCV automática"}><span className="t3">{getBcv() && String(getBcv()) !== getTasa() ? "Tasa" : "Tasa BCV"}</span><b className="t">Bs {getTasa()}</b></span>
              <span className={"hpill" + (online ? " ok" : "")}>
                <span className="dot" style={{ background: online ? "var(--ok)" : "var(--bad)" }} />
                <b>{online ? "En línea" : "Sin conexión"}</b>
              </span>
              <button className="tema-btn press atajos-btn" title="Atajos de teclado (F1)" aria-label="Atajos de teclado" onClick={() => setAyuda(true)}><UIcono k="teclado" sw={1.9} /></button>
              <TamBtn />
              <TemaBtn />
              <button className="tema-btn press hdr-salir" aria-label="Salir" title="Salir" onClick={onSalir}><UIcono k="back" sw={2} /></button>
            </div>
          </header>

          {bienv && <Bienvenida onIr={setTab} onCerrar={() => setBienv(false)} />}
          {plan && <AvisoPlan plan={plan} esCaja={esCaja} onPagar={irAPagar} />}
          {tab === "caja" && esCaja && <Caja />}
          {tab === "cuadre" && esCaja && <Cuadre />}
          {tab === "reportes" && <Reportes onIr={setTab} />}
          {tab === "inventario" && <ProductosYCompras />}
          {tab === "ventas" && <Ventas />}
          {tab === "contabilidad" && <Contabilidad />}
          {tab === "config" && <Configuracion />}
          {tab === "fiado" && <Clientes />}
          {tab === "puntos" && !esCaja && <PanelCierresPunto />}
          {tab === "nomina" && <Nomina onIrFiado={() => setTab("fiado")} />}
          {tab === "mas" && (esCaja
            ? <div className="stub"><b>Más</b><p>El manejo de usuarios y cajas lo hace el dueño desde su panel.</p><button className="btn ghost" onClick={onSalir}>Cerrar sesión</button></div>
            : <Usuarios onSalir={onSalir} />)}
          {esCaja && turno !== undefined && <TurnoBar turno={turno} onIr={() => setTab("cuadre")} />}
        </div>
      </div>

      {ayuda && <Atajos onClose={() => setAyuda(false)} />}
      {verCola && <ColaModal cola={cola} onClose={() => setVerCola(false)} />}
      {verSusp && plan && !plan.puedeCobrar && <SuspendidoModal plan={plan} esCaja={esCaja} onPagar={irAPagar}
        onClose={() => { setVerSusp(false); try { sessionStorage.setItem("kp_susp_visto", "1"); } catch { /* */ } }} />}
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
  // Neto de ventas: lo cobrado − el vuelto − lo devuelto en efectivo (las devoluciones
  // por pago móvil/punto ya vienen restadas del servidor en cada método).
  const dev = (m: "USD" | "VES") => (turno.movimientos || []).filter((x) => x.tipo === "DEVOLUCION" && x.moneda === m).reduce((s, x) => s + x.total, 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  // Las recargas cobradas en efectivo también entran a la gaveta.
  const rec = (m: "USD" | "VES") => (turno.movimientos || []).filter((x) => x.tipo === "RECARGA" && x.moneda === m).reduce((s, x) => s + x.total, 0);
  add("EFECTIVO_USD", "Efectivo $", r2(turno.efectivoUsd - turno.vueltoUsd - dev("USD") + rec("USD")), "USD");
  add("EFECTIVO_BS", "Efectivo Bs", r2(turno.efectivoBs - turno.vueltoBs - dev("VES") + rec("VES")), "VES");
  add("PAGO_MOVIL", "Pago móvil", dig("PAGO_MOVIL"), "VES");
  add("PUNTO", "Punto", dig("PUNTO"), "VES");
  add("BIOPAGO", "Biopago", dig("BIOPAGO"), "VES");
  if (dig("OTRO_USD")) add("OTRO_USD", "Otras $", dig("OTRO_USD"), "USD");
  if (dig("OTRO_BS")) add("OTRO_BS", "Otras Bs", dig("OTRO_BS"), "VES");
  const total = items.reduce((s, x) => s + x.usd, 0);
  const viejo = diasAbierto(turno.fechaApertura);
  return (
    <div className="turno-bar ab" role="status" aria-label="Cobrado en el turno">
      <button className="tb-st press" onClick={onIr} title="Ir al cierre"><i />Turno #{turno.turnoId}</button>
      {viejo > 0 && <button className="tb-viejo press" onClick={onIr} title="Este turno quedó abierto de otro día: ciérralo">Abierto desde {viejo === 1 ? "ayer" : "hace " + viejo + " días"} · Cerrar</button>}
      <div className="tb-items">
        {items.map((x) => <span key={x.id} className="tb-it"><small>{x.n}</small><b className="t">{x.v}</b></span>)}
      </div>
      {(dev("USD") > 0 || dev("VES") > 0) && <span className="tb-it tb-dev"><small>Devuelto</small><b className="t">{[dev("USD") > 0 ? "$ " + money(dev("USD")) : "", dev("VES") > 0 ? "Bs " + money(dev("VES")) : ""].filter(Boolean).join(" · ")}</b></span>}
      <span className="tb-tot"><small>Total cobrado</small><b className="t">≈ $ {money(total)}</b></span>
    </div>
  );
}

/** Productos del dueño: inventario y, al lado, las compras a proveedores. */
function ProductosYCompras() {
  const [v, setV] = useState<"inv" | "compras">("inv");
  useEffect(() => {
    const ir = (e: Event) => { const d = (e as CustomEvent).detail; if (d === "inv" || d === "compras") setV(d); };
    window.addEventListener("kp-sub-productos", ir);
    return () => window.removeEventListener("kp-sub-productos", ir);
  }, []);
  return (
    <div className="caja">
      <div className="toolbar sub-tabs">
        <div className="seg cmp-seg" role="tablist" aria-label="Productos o compras">
          <button className={v === "inv" ? "on" : ""} onClick={() => setV("inv")}>Inventario</button>
          <button className={v === "compras" ? "on" : ""} onClick={() => setV("compras")}>Compras</button>
        </div>
      </div>
      {v === "inv" ? <Inventario /> : <Compras />}
    </div>
  );
}

const fechaLarga = (iso: string | null) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" }) : "");
const usd2 = (n: number) => "$ " + Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Barra arriba de todo: roja y grande si el servicio está suspendido; ámbar si está por cortarse. */
function AvisoPlan({ plan, esCaja, onPagar }: { plan: Situacion; esCaja: boolean; onPagar: () => void }) {
  if (plan.puedeCobrar && plan.enPrueba && !esCaja) {
    return (
      <div className="plan-aviso plan-prueba" role="status">
        <UIcono k="alert" sw={2} />
        <span><b>{plan.mensaje}.</b> Elige tu plan y paga cuando quieras: al terminar la prueba la caja deja de cobrar.</span>
        <button className="btn2 press" onClick={onPagar}>Ver planes</button>
      </div>
    );
  }
  if (plan.puedeCobrar && plan.estadoEfectivo !== "AVISO") return null;
  if (!plan.puedeCobrar) {
    return (
      <div className="plan-susp" role="alert">
        <span className="plan-susp-ic"><UIcono k="lock" sw={2.2} /></span>
        <div className="plan-susp-tx">
          <b>Servicio suspendido</b>
          <span>{plan.pagoHasta ? "El plan de KioskPOS venció el " + fechaLarga(plan.pagoHasta) + "." : "El plan de KioskPOS no está activado."} {plan.deuda > 0 ? "Debes " + usd2(plan.deuda) + (plan.mesesPendientes > 1 ? " (" + plan.mesesPendientes + " meses)" : "") + "." : ""} Mientras tanto no se puede cobrar ni fiar; solo consultar.</span>
        </div>
        {esCaja ? <span className="plan-susp-cta">Avísale al dueño para que pague</span> : <button className="btn big press plan-susp-btn" onClick={onPagar}>Pagar y reactivar</button>}
      </div>
    );
  }
  return (
    <div className="plan-aviso" role="status">
      <UIcono k="alert" sw={2} />
      <span><b>Tu plan venció hace {plan.diasVencido} día(s).</b> Paga {plan.deuda > 0 ? usd2(plan.deuda) + " " : ""}para no perder el servicio{esCaja ? " (avísale al dueño)" : ""}.</span>
      {!esCaja && <button className="btn2 press" onClick={onPagar}>Reportar pago</button>}
    </div>
  );
}

/** Ventana grande al entrar si el servicio está suspendido. */
function SuspendidoModal({ plan, esCaja, onPagar, onClose }: { plan: Situacion; esCaja: boolean; onPagar: () => void; onClose: () => void }) {
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card susp-card" role="alertdialog" aria-label="Servicio suspendido">
        <div className="modal-body susp-body">
          <span className="susp-ic"><UIcono k="lock" sw={2} /></span>
          <h2>Servicio suspendido</h2>
          <p>{plan.pagoHasta ? "Tu plan de KioskPOS venció el " + fechaLarga(plan.pagoHasta) + "." : "Tu plan de KioskPOS no está activado."}</p>
          {plan.deuda > 0 && <div className="susp-deuda"><span>Debes</span><b className="t">{usd2(plan.deuda)}</b>{plan.mesesPendientes > 0 && <small>{plan.mesesPendientes} mes(es) de mensualidad</small>}</div>}
          <p className="susp-tx">Mientras no pagues, la caja <b>no puede cobrar ni dar crédito</b>. Tus datos están guardados y puedes consultarlos.
            {esCaja ? " Avísale al dueño del negocio para que pague." : " Paga por pago móvil, transferencia o Zelle y repórtalo: apenas se apruebe, todo vuelve a funcionar."}</p>
        </div>
        <div className="modal-foot two-btn">
          <button className="btn2 big press" onClick={onClose}>Entendido</button>
          {!esCaja && <button className="btn primary big press" onClick={onPagar}>Reportar mi pago</button>}
        </div>
      </div>
    </div>
  );
}
