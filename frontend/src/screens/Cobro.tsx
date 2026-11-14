import { useEffect, useRef, useState } from "react";
import { type ClienteFiado, type PagoCobro } from "../api";
import { UIcono } from "../icons";
import { calcularCobro, restoPara, type Montos } from "../cobroCalc";
import { extrasActivas, metodoActivo, type MetodoExtra } from "../config";
import { ElegirCliente } from "./Clientes";

// Cobro como el KioskPOS de escritorio (cobro-modal.fxml / CobroModalController):
// TODAS las formas de pago visibles de una vez (sin "agregar" una por una),
// billetes rápidos en efectivo, Enter cobra y Esc regresa. El cálculo es el mismo
// del servidor (cobroCalc.ts), así la pantalla y el servidor siempre coinciden.

interface Forma {
  id: string; n: string; sub: string; moneda: "USD" | "VES"; icon: string; color: string;
  ref?: boolean; billetes?: number[];
  extra?: MetodoExtra;   // forma de pago / moneda agregada en Configuración
  sim?: string;          // símbolo que se ve en la casilla (para otra moneda)
}

const FORMAS: Forma[] = [
  { id: "EFECTIVO_USD", n: "Efectivo $", sub: "Dólares", moneda: "USD", icon: "cash", color: "var(--primary)", billetes: [1, 5, 10, 20, 50, 100] },
  { id: "EFECTIVO_BS", n: "Efectivo Bs", sub: "Bolívares", moneda: "VES", icon: "bills", color: "var(--c-limpieza)", billetes: [50, 100, 200, 500] },
  { id: "PAGO_MOVIL", n: "Pago móvil", sub: "Bolívares", moneda: "VES", icon: "phone", color: "var(--c-bebidas)", ref: true },
  { id: "PUNTO", n: "Punto", sub: "Tarjeta débito", moneda: "VES", icon: "card", color: "var(--warn)" },
  { id: "BIOPAGO", n: "Biopago", sub: "Huella", moneda: "VES", icon: "finger", color: "var(--c-chucherias)" },
];

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
/** "1.234,50" / "1234.50" / "50,5" -> número. Con coma: los puntos son miles. */
const numOf = (s: string) => {
  const t = (s || "").trim();
  if (!t) return 0;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return parseFloat(norm) || 0;
};
const aTexto = (n: number) => (n <= 0 ? "" : n.toFixed(2).replace(".", ","));

/** Límite de fiado: el propio, o el sueldo si es un trabajador sin límite (igual que el servidor). */
const limiteDe = (c: ClienteFiado) => (c.limiteUsd > 0 ? c.limiteUsd : c.tipo === "TRABAJADOR" ? c.sueldoUsd || 0 : 0);

export interface ResumenPago { payLine: string; change: string; changeNote: string; vueltoUsd?: number; vueltoBs?: number; vueltoManual?: boolean; credito?: { nombre: string; trabajador: boolean; montoUsd: number }; }

export function Cobro({ total, totalBs, tasa, err, onBack, onConfirm }: {
  total: number; totalBs?: number; tasa: number; isDesktop: boolean; err: string;
  onBack: () => void;
  onConfirm: (pagos: PagoCobro[], resumen: ResumenPago, clienteId?: number | null) => void;
}) {
  const [txt, setTxt] = useState<Record<string, string>>({});
  const [ref, setRef] = useState("");
  // Vuelto: "auto" decide solo (Bs si pagó en Bs o es menos de $1; si no, dólares enteros + resto en Bs).
  const [vModo, setVModo] = useState<"auto" | "USD" | "VES" | "MIXTO">("auto");
  const [vUsdTxt, setVUsdTxt] = useState("");
  const [vBsTxt, setVBsTxt] = useState<string | null>(null); // null = los Bs se calculan solos
  const [enviando, setEnviando] = useState(false);
  const [foco, setFoco] = useState<string>("EFECTIVO_USD"); // casilla activa (para F8)
  const primero = useRef<HTMLInputElement>(null);
  const [cliente, setCliente] = useState<ClienteFiado | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const eligiendoRef = useRef(false); eligiendoRef.current = eligiendo;

  // Solo las formas de pago activas en Configuración (si apagaron todas, se muestran todas).
  const activas = FORMAS.filter((f) => metodoActivo(f.id));
  const extras: Forma[] = extrasActivas().map((x) => ({
    id: "X:" + x.id, n: x.nombre, extra: x, color: "var(--c-charcuteria)", icon: x.tipo === "VES" ? "bills" : "cash",
    moneda: x.tipo === "VES" ? "VES" : "USD",
    sub: x.tipo === "OTRA" ? `1 ${x.simbolo || "u"} = $ ${money(x.tasaUsd || 0)}` : x.tipo === "USD" ? "En dólares" : "En bolívares",
    sim: x.tipo === "OTRA" ? (x.simbolo || "u") : undefined,
  }));
  // Fiado: se anota en la cuenta de un cliente (en $). No entra dinero ni da vuelto.
  const fiado: Forma[] = metodoActivo("FIADO") ? [{ id: "FIADO", n: "Crédito", moneda: "USD", icon: "user", color: "var(--c-charcuteria)",
    sub: cliente ? cliente.nombre + (cliente.saldoUsd > 0 ? " · debe " + usd(cliente.saldoUsd) : "") : "A cuenta de un cliente o trabajador" }] : [];
  const formas = [...(activas.length ? activas : FORMAS), ...extras, ...fiado];
  const forma = (id: string) => formas.find((f) => f.id === id);
  const monedaDe = (id: string) => forma(id)?.moneda ?? "USD";
  // Unidades escritas -> monto para el cálculo (otra moneda se pasa a $ con su tasa).
  const unidades = (f: Forma) => numOf(txt[f.id] || "");
  const aCalc = (f: Forma, u: number) => (f.extra?.tipo === "OTRA" ? Math.round(u * (f.extra.tasaUsd || 0) * 100) / 100 : u);
  const deCalc = (f: Forma, v: number) => (f.extra?.tipo === "OTRA" ? (f.extra.tasaUsd > 0 ? Math.ceil((v / f.extra.tasaUsd) * 100 - 1e-6) / 100 : 0) : v);
  const montos: Montos = Object.fromEntries(formas.map((f) => [f.id, aCalc(f, unidades(f))])) as Montos;
  // El crédito no es dinero: se descuenta del total y lo demás se cobra normal (igual que el servidor).
  const fiadoUsd = montos.FIADO || 0;
  const sinFiado: Montos = { ...montos, FIADO: 0 };
  const neto = Math.max(0, Math.round((total - fiadoUsd) * 100) / 100);
  const bsFijo = fiadoUsd > 0 ? undefined : totalBs;
  const totalBsVista = totalBs ?? Math.round(total * tasa * 100) / 100;
  const e0 = calcularCobro(neto, tasa, sinFiado, monedaDe, bsFijo);
  const modo = vModo !== "auto" ? vModo
    : e0.soloBs || e0.sobraUsd < 1 ? "VES" : Number.isInteger(Math.round(e0.sobraUsd * 100) / 100) ? "USD" : "MIXTO";
  const dolaresVuelto = modo === "USD" ? e0.sobraUsd : modo === "VES" ? 0
    : Math.min(e0.sobraUsd, vModo === "MIXTO" ? numOf(vUsdTxt) : Math.floor(e0.sobraUsd));
  const bsManual = vBsTxt != null;
  const e = calcularCobro(neto, tasa, sinFiado, monedaDe, bsFijo, dolaresVuelto, bsManual ? numOf(vBsTxt) : undefined);
  const hayVuelto = e.cubre && e.sobraBs > 0;
  const entregaTxt = e.vueltoUsd > 0 && e.vueltoBs > 0 ? usd(e.vueltoUsd) + " + " + bs(e.vueltoBs)
    : e.vueltoUsd > 0 ? usd(e.vueltoUsd) : bs(e.vueltoBs);
  const vueltoDeMas = hayVuelto && e.difBs < -1;
  const elegirVuelto = (m: "USD" | "VES" | "MIXTO") => {
    setVModo(m); setVBsTxt(null);
    if (m === "MIXTO") setVUsdTxt(String(Math.floor(e0.sobraUsd) || 0));
  };
  const pasoDolar = (d: number) => {
    const n = Math.min(Math.floor(e0.sobraUsd), Math.max(0, Math.floor(numOf(vModo === "MIXTO" ? vUsdTxt : String(dolaresVuelto))) + d));
    setVModo("MIXTO"); setVUsdTxt(String(n)); setVBsTxt(null);
  };
  // Escribir los Bs a mano: los dólares quedan como están y se guarda lo que de verdad se entrega.
  const escribirBs = (v: string) => {
    if (vModo !== "MIXTO") { setVModo("MIXTO"); setVUsdTxt(String(dolaresVuelto).replace(".", ",")); }
    setVBsTxt(v.replace(/[^\d.,]/g, ""));
  };
  const pmUsado = (montos.PAGO_MOVIL || 0) > 0;
  // La referencia del pago móvil es OPCIONAL; si se escribe, que sea completa (4 a 6 dígitos).
  const refMala = pmUsado && ref.length > 0 && !/^\d{4,6}$/.test(ref);
  const fiadoMal = fiadoUsd <= 0 ? ""
    : !cliente ? "Elige a quién le das crédito"
    : fiadoUsd > total + 0.005 ? "El crédito no puede pasar del total"
    : limiteDe(cliente) > 0 && cliente.saldoUsd + fiadoUsd > limiteDe(cliente) + 0.005 ? "Pasa el límite de crédito de " + cliente.nombre + " (" + usd(limiteDe(cliente)) + ")"
    : "";

  // El motivo REAL por el que no se puede cobrar (antes decía "Faltan $0,00" aunque faltara la referencia).
  const bloqueo = !(e.hayPago || fiadoUsd > 0) ? "Escribe cuánto pagó el cliente"
    : !e.cubre ? "Faltan " + usd(e.faltaUsd) + " · " + bs(e.faltaBs)
    : refMala ? "La referencia lleva 4 a 6 dígitos (o déjala vacía)"
    : vueltoDeMas ? "El vuelto pasa por " + bs(-e.difBs) + " lo que se le debe"
    : fiadoMal ? fiadoMal
    : "";
  const valido = !bloqueo && !enviando;

  const set = (id: string, v: string) => setTxt((t) => ({ ...t, [id]: v }));
  const billete = (id: string, b: number) => set(id, aTexto((montos[id] || 0) + b)); // suma, como el escritorio
  const limpiar = () => { setTxt({}); setRef(""); setVModo("auto"); setVUsdTxt(""); setVBsTxt(null); };

  // "Resto aquí": SIEMPRE hace algo visible.
  //  - Si falta dinero con las demás formas: pone en esta lo que falta (y lo dice en el botón).
  //  - Si las demás ya cubren todo: "Todo aquí" pasa el cobro completo a esta forma.
  const restoDe = (f: Forma) => deCalc(f, restoPara(f.id, total, tasa, montos, monedaDe, totalBs));
  const todoDe = (f: Forma) => deCalc(f, restoPara(f.id, total, tasa, {}, monedaDe, totalBs));
  const accionResto = (id: string) => {
    const f = forma(id); if (!f) return;
    const r = restoDe(f);
    if (r > 0) set(f.id, aTexto(r));
    else { setTxt({ [f.id]: aTexto(todoDe(f)) }); if (f.id !== "PAGO_MOVIL") setRef(""); }
  };
  const fmtF = (f: Forma, v: number) => (f.sim ? f.sim + " " + money(v) : f.moneda === "USD" ? usd(v) : bs(v));
  const etiquetaResto = (f: Forma) => {
    const r = restoDe(f), cur = unidades(f);
    if (r > 0 && Math.abs(r - cur) < 0.005) return { t: "✓ Completo", ok: true };
    if (r > 0) return { t: "Resto aquí · " + fmtF(f, r), ok: false };
    return { t: "Todo aquí · " + fmtF(f, todoDe(f)), ok: false };
  };

  const confirmar = () => {
    if (!valido) return;
    setEnviando(true);
    const usados = formas.filter((f) => (montos[f.id] || 0) > 0);
    const pagos: PagoCobro[] = usados.map((f) => f.id === "FIADO"
      ? { metodo: "FIADO", moneda: "USD", montoOriginal: Math.round(fiadoUsd * 100) / 100 }
      : f.extra
      ? { metodo: "OTRO", moneda: f.moneda, montoOriginal: Math.round((montos[f.id] || 0) * 100) / 100,
          referencia: (f.n + (f.sim ? " " + f.sim + " " + money(unidades(f)) : "")).slice(0, 100) }
      : { metodo: f.id as PagoCobro["metodo"], moneda: f.moneda, montoOriginal: Math.round((montos[f.id] || 0) * 100) / 100,
          ...(f.id === "PAGO_MOVIL" && ref ? { referencia: ref } : {}) });
    const payLine = usados.map((f) => f.n + " " + fmtF(f, unidades(f)) + (f.id === "PAGO_MOVIL" && ref ? " ref. " + ref : f.id === "FIADO" && cliente ? " (" + cliente.nombre + ")" : "")).join(" + ");
    const change = hayVuelto ? entregaTxt : "";
    onConfirm(pagos, {
      payLine, change, changeNote: change ? "El vuelto sale del efectivo" : "", vueltoUsd: e.vueltoUsd, vueltoBs: e.vueltoBs,
      vueltoManual: hayVuelto && bsManual,
      ...(fiadoUsd > 0 && cliente ? { credito: { nombre: cliente.nombre, trabajador: cliente.tipo === "TRABAJADOR", montoUsd: fiadoUsd } } : {}),
    }, fiadoUsd > 0 ? cliente?.id : null);
  };

  // Teclado como el escritorio: Enter cobra, Esc regresa.
  const confirmarRef = useRef(confirmar); confirmarRef.current = confirmar;
  const backRef = useRef(onBack); backRef.current = onBack;
  const restoRef = useRef(() => {}); restoRef.current = () => accionResto(foco);
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if (eligiendoRef.current) return; // el selector de cliente maneja su teclado
      if (ev.key === "Enter") { ev.preventDefault(); confirmarRef.current(); }
      else if (ev.key === "Escape") { ev.preventDefault(); backRef.current(); }
      else if (ev.key === "F8") { ev.preventDefault(); restoRef.current(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  // En PC, el cursor arranca en Efectivo $ para escribir de una (en móvil no, para no abrir el teclado solo).
  useEffect(() => { if (window.matchMedia("(min-width:1024px)").matches) primero.current?.focus(); }, []);
  // Si llega un error del servidor, se puede reintentar.
  useEffect(() => { if (err) setEnviando(false); }, [err]);

  const pct = (id: string) => {
    const m = montos[id] || 0; if (m <= 0 || total <= 0) return 0;
    const enUsd = monedaDe(id) === "USD" ? m : m / (tasa || 1);
    return Math.min(100, (enUsd / total) * 100);
  };

  return (
    <div className="view">
      {eligiendo && <ElegirCliente onClose={() => setEligiendo(false)} onElegir={(c) => {
        setCliente(c); setEligiendo(false);
        if (!((montos.FIADO || 0) > 0)) { const r = restoPara("FIADO", total, tasa, montos, monedaDe, totalBs); if (r > 0) set("FIADO", aTexto(r)); }
      }} />}
      <div className="co-head">
        <button className="back press" onClick={onBack}><UIcono k="back" sw={2} />Ticket <kbd className="kb">Esc</kbd></button>
        <div className="steps"><b style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Cobrar</b></div>
        <div className="co-tot"><b className="t">{usd(total)}</b><small className="t">{bs(totalBsVista)}</small></div>
      </div>

      <div className="cb3-body">
        <div className="cb3-main">
          {/* Resumen: Total / Cubierto / Falta / Vuelto */}
          <div className="cb3-sum">
            <div className="cb3-cell tot"><span className="k">Total a cobrar</span><b className="t">{usd(total)}</b><span className="s t">{bs(totalBsVista)}</span></div>
            <div className="cb3-cell ok"><span className="k">Cubierto</span><b className="t">{usd(Math.min(e.cubre ? total : e.cubierto + fiadoUsd, total))}</b><span className="s">{(() => { const n = formas.filter((f) => (montos[f.id] || 0) > 0).length; return n === 0 ? "Sin pagos" : n === 1 ? "1 forma de pago" : n + " formas de pago"; })()}</span></div>
            <div className={"cb3-cell" + (e.cubre ? "" : " warn")}><span className="k">Falta</span><b className="t">{usd(e.faltaUsd)}</b><span className="s t">{bs(e.faltaBs)}</span></div>
            <div className={"cb3-cell" + (hayVuelto ? " info" : "")}><span className="k">Vuelto</span><b className="t">{usd(e.sobraUsd)}</b><span className="s t">{hayVuelto ? bs(e.sobraBs) : "Sale del efectivo"}</span></div>
            <div className="progress cb3-bar">
              {formas.map((f) => { const w = pct(f.id); return w > 0 ? <i key={f.id} style={{ width: w + "%", background: f.color }} /> : null; })}
            </div>
          </div>

          {/* TODAS las formas de pago a la vista */}
          <div className="cb3-grid">
            {formas.map((f, i) => {
              const m = montos[f.id] || 0;
              const er = etiquetaResto(f);
              return (
                <div key={f.id} className={"cb3-card" + (m > 0 ? " on" : "")} style={{ ["--mc" as string]: f.color }}>
                  <div className="cb3-ch">
                    <span className="co2-ic" style={{ background: `color-mix(in srgb, ${f.color} 15%, var(--surface))`, color: f.color }}><UIcono k={f.icon} sw={1.8} /></span>
                    <div className="cb3-nm"><b>{f.n}</b><span>{f.sub}</span></div>
                    <button className={"cb3-rest press" + (er.ok ? " ok" : "")} title="Completa lo que falta en esta forma de pago (F8 en la casilla)" onClick={() => accionResto(f.id)}>{er.t}{foco === f.id && <kbd className="kb">F8</kbd>}</button>
                  </div>
                  <label className="cb3-in">
                    <i>{f.sim || (f.moneda === "USD" ? "$" : "Bs")}</i>
                    <input ref={i === 0 ? primero : undefined} className="t" inputMode="decimal" placeholder="0,00" value={txt[f.id] || ""}
                      onChange={(ev) => set(f.id, ev.target.value.replace(/[^\d.,]/g, ""))} onFocus={(ev) => { ev.target.select(); setFoco(f.id); }}
                      aria-label={"Monto en " + f.n} />
                    {m > 0 && <button className="cb3-clr" aria-label={"Borrar " + f.n} onClick={(ev) => { ev.preventDefault(); set(f.id, ""); }}><UIcono k="close" sw={2} /></button>}
                  </label>
                  {m > 0 && <span className="cb3-eq t">{f.sim ? "= " + usd(m) + " · " + bs(Math.round(m * tasa * 100) / 100) : f.moneda === "USD" ? "= " + bs(Math.round(m * tasa * 100) / 100) : "= " + usd(Math.round((m / (tasa || 1)) * 100) / 100)}</span>}
                  {f.ref && (
                    <label className={"cb3-ref" + (refMala ? " bad" : "")}>
                      <span>Referencia <small className="opt">(opcional)</small></span>
                      <input className="t" inputMode="numeric" placeholder="4 a 6 dígitos" value={ref} onChange={(ev) => setRef(ev.target.value.replace(/\D/g, "").slice(0, 6))} aria-label="Referencia del pago móvil" />
                      {!refMala && ref.length >= 4 && <span className="okc"><UIcono k="check" sw={2.4} /></span>}
                    </label>
                  )}
                  {f.id === "FIADO" && (
                    <div className="cb3-cli">
                      {cliente
                        ? <><span className="cb3-cli-nm"><UIcono k="user" sw={2} /><b>{cliente.nombre}</b>{cliente.limiteUsd > 0 && <small>límite {usd(cliente.limiteUsd)}</small>}</span>
                            <button className="press" onClick={() => setEligiendo(true)}>Cambiar</button></>
                        : <button className="press cb3-cli-el" onClick={() => setEligiendo(true)}><UIcono k="search" sw={2} />Elegir cliente o trabajador</button>}
                    </div>
                  )}
                  {f.billetes && (
                    <div className="cb3-bills">
                      {f.billetes.map((b) => <button key={b} className="press" aria-label={"Sumar " + (f.moneda === "USD" ? "$" : "Bs ") + b} onClick={() => billete(f.id, b)}>+{f.moneda === "USD" ? "$" : ""}{b}</button>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="tip"><span style={{ color: "var(--warn)" }}><UIcono k="cash" /></span>
            <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>El vuelto sale del efectivo de la gaveta</b>
              <div className="t2" style={{ fontSize: 12.5, fontWeight: 500 }}>Pago móvil, punto y Biopago se cobran exactos. “Resto aquí” pone en esa forma lo que falta; si ya está todo cubierto, “Todo aquí” pasa el cobro completo a esa forma.</div></div>
          </div>
        </div>

        {/* Acciones (a la derecha en PC, fijas abajo en tablet/móvil) */}
        <aside className="cb3-act">
          {hayVuelto && (
            <div className="vz" aria-label="Vuelto">
              <div className="vz-h"><span>Vuelto</span><b className="t">{usd(e.sobraUsd)}</b><small className="t">{bs(e.sobraBs)}</small></div>
              <span className="vz-q">¿Cómo lo das?</span>
              <div className="vz-seg" role="radiogroup" aria-label="Cómo dar el vuelto">
                <button role="radio" aria-checked={modo === "USD"} className={modo === "USD" ? "on" : ""} onClick={() => elegirVuelto("USD")}>Todo en $</button>
                <button role="radio" aria-checked={modo === "VES"} className={modo === "VES" ? "on" : ""} onClick={() => elegirVuelto("VES")}>Todo en Bs</button>
                <button role="radio" aria-checked={modo === "MIXTO"} className={modo === "MIXTO" ? "on" : ""} disabled={e0.sobraUsd < 1} onClick={() => elegirVuelto("MIXTO")}>$ y Bs</button>
              </div>
              <div className="vz-mix">
                <span>Entregas</span>
                <div className="vz-step">
                  <button className="press" aria-label="Un dólar menos" onClick={() => pasoDolar(-1)}>−</button>
                  <label className="vz-in"><i>$</i><input className="t" inputMode="decimal" aria-label="Dólares del vuelto"
                    value={vModo === "MIXTO" ? vUsdTxt : String(dolaresVuelto).replace(".", ",")}
                    onFocus={(ev) => ev.target.select()}
                    onChange={(ev) => { setVModo("MIXTO"); setVBsTxt(null); setVUsdTxt(ev.target.value.replace(/[^\d.,]/g, "")); }} /></label>
                  <button className="press" aria-label="Un dólar más" onClick={() => pasoDolar(1)}>+</button>
                </div>
                <label className={"vz-in vz-bs" + (bsManual ? " man" : "")}><i>Bs</i><input className="t" inputMode="decimal" aria-label="Bolívares del vuelto"
                  value={bsManual ? vBsTxt! : e.vueltoBs > 0 ? money(e.vueltoBs) : "0"}
                  onFocus={(ev) => ev.target.select()} onChange={(ev) => escribirBs(ev.target.value)} /></label>
                {bsManual && <button className="vz-auto" onClick={() => setVBsTxt(null)}>Calcular solo</button>}
              </div>
              {bsManual && e.difBs > 0.004 && <span className="vz-dif">El cliente recibe {bs(e.difBs)} menos: queda en la caja.</span>}
              {vueltoDeMas && <span className="vz-dif mal">Le estás dando {bs(-e.difBs)} de más.</span>}
              <div className="vz-ent"><span>Entrega</span><b className="t">{entregaTxt}</b></div>
              <small className="vz-nota">Sale del efectivo de la gaveta{e.vueltoUsd > 0 && e.vueltoBs > 0 ? ": dólares en billetes y el resto en bolívares." : "."}</small>
            </div>
          )}
          {err && <p className="pinmsg err">{err}</p>}
          <button className="btn primary big press cb3-go" disabled={!valido} onClick={confirmar}>
            {enviando ? "Cobrando…" : bloqueo || <>Cobrar y listo · {usd(total)} <kbd className="kb">Enter</kbd></>}
          </button>
          <div className="cb3-sec">
            <button className="btn2 press" onClick={limpiar}>Limpiar</button>
            <button className="btn2 press" onClick={onBack}>Cancelar</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

