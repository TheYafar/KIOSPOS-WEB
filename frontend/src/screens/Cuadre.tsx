import { useEffect, useRef, useState } from "react";
import { abrirTurno, cerrarTurno, resumenTurno, turnoActual, type TurnoResumen } from "../api";
import { getTasa, getTurnoId, setTurnoId } from "../session";
import { UIcono } from "../icons";
import { calcularArqueo, leerMonto, type FilaArqueo } from "../arqueo";
import { conectorDisponible, imprimirTicket } from "../conector";
import { metodoActivo } from "../config";
import { MovimientosCaja } from "./MovimientosCaja";

/** Avisa al resto de la app (barra de montos, indicador) que el turno cambió. */
const avisarTurno = () => window.dispatchEvent(new Event("kp-turno"));

// Cierre de caja: el cajero CUENTA cada forma de pago (efectivo $, efectivo Bs, pago
// móvil, punto, Biopago) y la app le dice fila por fila si cuadra, falta o sobra.
// Se maneja con teclado: Enter pasa a la siguiente casilla, F8 abre la calculadora de
// billetes y Ctrl+Enter cierra el turno.

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
const fmt = (moneda: string, n: number) => (moneda === "USD" ? usd(n) : bs(n));
const numOf = (s: string) => leerMonto(s) ?? 0;

const DEN_USD = [100, 50, 20, 10, 5, 2, 1];
const DEN_BS = [500, 200, 100, 50, 20, 10, 5];

const INFO: Record<string, { n: string; icon: string; color: string; donde: string }> = {
  EFECTIVO_USD: { n: "Efectivo $", icon: "cash", color: "var(--primary)", donde: "Cuenta los billetes en dólares de la gaveta" },
  EFECTIVO_BS: { n: "Efectivo Bs", icon: "bills", color: "var(--c-limpieza)", donde: "Cuenta los billetes en bolívares de la gaveta" },
  PAGO_MOVIL: { n: "Pago móvil", icon: "phone", color: "var(--c-bebidas)", donde: "Lo que te llegó al banco por pago móvil" },
  PUNTO: { n: "Punto de venta", icon: "card", color: "var(--warn)", donde: "El total del cierre de lote del punto" },
  BIOPAGO: { n: "Biopago", icon: "finger", color: "var(--c-chucherias)", donde: "El total que reporta Biopago" },
  OTRO_USD: { n: "Otras en $", icon: "cash", color: "var(--c-charcuteria)", donde: "Zelle, Binance y otras formas cobradas en $" },
  OTRO_BS: { n: "Otras en Bs", icon: "bills", color: "var(--c-charcuteria)", donde: "Otras formas de pago cobradas en Bs" },
};

function Estado({ f }: { f: FilaArqueo }) {
  if (f.estado === "sin-contar") return <span className="pill">Sin contar</span>;
  if (f.estado === "sin-movimiento") return <span className="pill">Sin ventas</span>;
  if (f.estado === "cuadra") return <span className="pill ok"><i />Cuadra</span>;
  if (f.estado === "sobra") return <span className="pill info"><i />Sobra {fmt(f.moneda, f.diferencia)}</span>;
  return <span className="pill late"><i />Falta {fmt(f.moneda, Math.abs(f.diferencia))}</span>;
}

/** Texto de 40 columnas para imprimir el cierre (tipo "Ticket Z" del escritorio). */
function textoCierre(turnoId: number, filas: FilaArqueo[], difUsd: number, obs: string): string {
  const w = 40, pad = (l: string, r: string) => (l.length + r.length >= w ? (l + " " + r).slice(0, w) : l + " ".repeat(w - l.length - r.length) + r);
  const center = (s: string) => " ".repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s;
  const now = new Date();
  const L = [center("CIERRE DE CAJA"), center("Turno #" + turnoId), center(now.toLocaleString("es-VE")), "-".repeat(w)];
  filas.forEach((f) => {
    L.push((INFO[f.metodo]?.n || f.metodo).toUpperCase());
    L.push(pad("  Debe haber", fmt(f.moneda, f.esperado)));
    L.push(pad("  Contado", f.contado == null ? "(sin contar)" : fmt(f.moneda, f.contado)));
    if (f.contado != null && f.diferencia !== 0) L.push(pad(f.diferencia < 0 ? "  FALTA" : "  SOBRA", fmt(f.moneda, Math.abs(f.diferencia))));
  });
  L.push("-".repeat(w), pad("DIFERENCIA TOTAL (en $)", usd(difUsd)));
  if (obs.trim()) { L.push("-".repeat(w), "Obs: " + obs.trim().slice(0, 200)); }
  L.push("-".repeat(w), "", "Firma cajero: ______________________", "", "Firma recibe: ______________________");
  return L.join("\n");
}

export function Cuadre() {
  const [turno, setTurno] = useState<TurnoResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fUsd, setFUsd] = useState("20");
  const [fBs, setFBs] = useState("0");
  const [cont, setCont] = useState<Record<string, string>>({});
  const [obs, setObs] = useState("");
  const [calc, setCalc] = useState<null | { moneda: "USD" | "VES"; destino: "fondo" | "arqueo" }>(null);
  const [cerrado, setCerrado] = useState<null | { turnoId: number; filas: FilaArqueo[]; difUsd: number; obs: string }>(null);
  const [err, setErr] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const obsRef = useRef<HTMLTextAreaElement>(null);
  const fondoRef = useRef<HTMLInputElement>(null);
  const tasa = Number(getTasa()) || 0;

  // El servidor manda: si el equipo olvidó el turno (otro navegador, se borró la memoria),
  // se le pregunta al servidor si esta caja tiene un turno ABIERTO y se recupera.
  const recuperar = () => turnoActual()
    .then((t) => { if (t && t.turnoId) { setTurnoId(t.turnoId); setTurno(t); } else { setTurnoId(null); setTurno(null); } })
    .catch(() => { /* sin conexión: se queda como está */ })
    .finally(() => setCargando(false));
  useEffect(() => {
    const id = getTurnoId();
    if (id) resumenTurno(id).then((t) => { if (t.estado === "ABIERTO") { setTurno(t); setCargando(false); } else recuperar(); }).catch(() => recuperar());
    else recuperar();
  }, []);

  // En PC, el cursor arranca en la primera casilla (abrir: fondo; cerrar: efectivo $).
  useEffect(() => {
    if (cargando || !window.matchMedia("(min-width:1024px)").matches) return;
    if (!turno) fondoRef.current?.focus(); else inputs.current[0]?.focus();
  }, [cargando, turno?.turnoId]);

  const abrir = async () => {
    try {
      const t = await abrirTurno(numOf(fUsd), numOf(fBs));
      setTurnoId(t.turnoId); setTurno(t); setErr(""); avisarTurno();
    } catch (e) {
      const msg = (e as Error).message;
      // Ya estaba abierta en el servidor: la recuperamos en vez de mostrar el error.
      if (/turno abierto/i.test(msg)) { await recuperar(); avisarTurno(); } else setErr(msg);
    }
  };

  const refrescar = async () => {
    if (!turno) return;
    try { setTurno(await resumenTurno(turno.turnoId)); setErr(""); } catch (e) { setErr((e as Error).message); }
  };

  const nuevo = () => { setCerrado(null); setTurno(null); setCont({}); setObs(""); setConfirmar(false); setAviso(""); };

  if (cargando) return <div className="stub">Cargando…</div>;

  // ----- Resultado del cierre (detallado) -----
  if (cerrado) {
    const imprimir = async () => {
      if (!(await conectorDisponible())) { setAviso("El Conector de impresión no está abierto en esta PC."); return; }
      try { await imprimirTicket(textoCierre(cerrado.turnoId, cerrado.filas, cerrado.difUsd, cerrado.obs), false); setAviso("Cierre enviado a la impresora."); }
      catch (e) { setAviso((e as Error).message); }
    };
    const malas = cerrado.filas.filter((f) => f.estado === "falta" || f.estado === "sobra");
    return (
      <div className="czwrap wide">
        <div className={"card czhero" + (malas.length ? " warn" : "")}>
          <span className="ibox" style={{ background: malas.length ? "var(--bad-soft)" : "var(--ok-soft)", color: malas.length ? "var(--bad)" : "var(--ok)" }}><UIcono k={malas.length ? "alert" : "check"} sw={2.2} /></span>
          <div><b>Turno #{cerrado.turnoId} cerrado {malas.length ? "con diferencias" : "— todo cuadró"}</b>
            <span>{malas.length ? malas.map((f) => (f.estado === "falta" ? "Falta " : "Sobra ") + fmt(f.moneda, Math.abs(f.diferencia)) + " en " + (INFO[f.metodo]?.n || f.metodo)).join(" · ") : "Cada forma de pago coincide con lo que registró el sistema."}</span></div>
        </div>
        <div className="card arq">
          <div className="arq-head"><h3 className="h3">Detalle del cierre</h3><span className="arq-tot">Diferencia total <b className="t">{usd(cerrado.difUsd)}</b></span></div>
          <div className="arq-table">
            <div className="arq-row arq-th"><span>Forma de pago</span><span>Debe haber</span><span>Contado</span><span>Estado</span></div>
            {cerrado.filas.map((f) => (
              <div className="arq-row" key={f.metodo}>
                <span className="arq-nm"><b>{INFO[f.metodo]?.n || f.metodo}</b></span>
                <span className="t" data-k="Debe haber">{fmt(f.moneda, f.esperado)}</span>
                <span className="t" data-k="Contado">{f.contado == null ? "—" : fmt(f.moneda, f.contado)}</span>
                <span><Estado f={f} /></span>
              </div>
            ))}
          </div>
          {cerrado.obs.trim() && <p className="hint">Observaciones: {cerrado.obs}</p>}
        </div>
        {aviso && <p className="pinmsg">{aviso}</p>}
        <div className="two"><button className="btn2 press" onClick={imprimir}><UIcono k="print" />Imprimir cierre</button><button className="cta center press" onClick={nuevo}>Listo</button></div>
      </div>
    );
  }

  // ----- Caja sin abrir -----
  if (!turno) {
    return (
      <div className="czwrap wide">
        <div className="cz-open">
          <div className="cz-open-main">
            <div className="card czhero"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="cash" sw={1.9} /></span><div><b>La caja está cerrada</b><span>Cuenta el fondo de la gaveta y ábrela para empezar a vender.</span></div></div>
            <div className="card cz-count">
              <h3 className="h3">¿Con cuánto abres la gaveta?</h3>
              <div className="cz-fields">
                <div className="cz-field">
                  <span className="k">Fondo en dólares</span>
                  <div className="cz-in">
                    <div className="inpw"><i>$</i><input ref={fondoRef} className="inp pre t" value={fUsd} onChange={(e) => setFUsd(e.target.value)} inputMode="decimal" aria-label="Fondo en dólares"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (document.querySelector("[aria-label='Fondo en bolívares']") as HTMLInputElement | null)?.focus(); } else if (e.key === "F8") { e.preventDefault(); setCalc({ moneda: "USD", destino: "fondo" }); } }} /></div>
                    <button className="btn2 press" onClick={() => setCalc({ moneda: "USD", destino: "fondo" })}><UIcono k="bills" />Contar billetes</button>
                  </div>
                </div>
                <div className="cz-field">
                  <span className="k">Fondo en bolívares</span>
                  <div className="cz-in">
                    <div className="inpw"><i>Bs</i><input className="inp t" style={{ paddingLeft: 40 }} value={fBs} onChange={(e) => setFBs(e.target.value)} inputMode="decimal" aria-label="Fondo en bolívares"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); abrir(); } else if (e.key === "F8") { e.preventDefault(); setCalc({ moneda: "VES", destino: "fondo" }); } }} /></div>
                    <button className="btn2 press" onClick={() => setCalc({ moneda: "VES", destino: "fondo" })}><UIcono k="bills" />Contar billetes</button>
                  </div>
                </div>
              </div>
              <span className="hint">El fondo es el sencillo para dar vuelto. Se suma una sola vez al cuadre. <span className="kbtip">Enter avanza · F8 cuenta billetes</span></span>
              {err && <p className="pinmsg err">{err}</p>}
              <button className="cta center press cz-cerrar" onClick={abrir}><UIcono k="check" sw={2.2} />Abrir caja</button>
            </div>
          </div>
          <aside className="card cz-guide">
            <h3 className="h3">Así funciona el turno</h3>
            <ol className="cz-steps-list">
              <li><b>1</b><div><strong>Abre con el fondo</strong><span>Cuenta el sencillo que dejas en la gaveta para dar vuelto.</span></div></li>
              <li><b>2</b><div><strong>Vende</strong><span>Cada venta se suma sola al turno: efectivo, pago móvil, punto y Biopago.</span></div></li>
              <li><b>3</b><div><strong>Cuenta cada forma de pago y cierra</strong><span>La app te dice en cuál cuadra, en cuál falta y en cuál sobra.</span></div></li>
            </ol>
            {tasa > 0 && <div className="cz-total"><span>Tasa BCV de hoy</span><div><b className="t">Bs {money(tasa)}</b></div></div>}
          </aside>
        </div>
        {calc && <CalcBilletes moneda={calc.moneda} onClose={() => setCalc(null)}
          onUsar={(t) => { (calc.moneda === "USD" ? setFUsd : setFBs)(money(t)); setCalc(null); }} />}
      </div>
    );
  }

  // ----- Turno abierto: arqueo por forma de pago -----
  const metodos = (turno.metodos?.length ? turno.metodos : [
    { metodo: "EFECTIVO_USD", moneda: "USD", esperado: turno.esperadoUsd, digital: false },
    { metodo: "EFECTIVO_BS", moneda: "VES", esperado: turno.esperadoBs, digital: false },
  ]).filter((m) => metodoActivo(m.metodo) || m.esperado !== 0); // las apagadas no se cuentan, salvo que tengan dinero
  const a = calcularArqueo(metodos, cont, tasa);
  const digital = metodos.filter((m) => m.digital).reduce((s, m) => s + m.esperado, 0);
  // Cómo se llega a lo esperado: fondo + ventas − vuelto ± movimientos de caja y abonos.
  const NOMBRE_MOV: Record<string, string> = { GASTO: "gastos", RETIRO: "retiros", INGRESO: "ingresos", AVANCE: "avances", ABONO: "abonos fiado" };
  const movTexto = (moneda: "USD" | "VES") => (turno.movimientos || []).filter((x) => x.moneda === moneda && x.total > 0)
    .map((x) => ` ${x.tipo === "INGRESO" || x.tipo === "ABONO" ? "+" : "−"} ${NOMBRE_MOV[x.tipo]} ${fmt(moneda, x.total)}`).join("");
  const detalle = (m: string) =>
    m === "EFECTIVO_USD" ? `Fondo ${usd(turno.fondoUsd)} + ventas ${usd(turno.efectivoUsd)} − vuelto ${usd(turno.vueltoUsd)}${movTexto("USD")}`
    : m === "EFECTIVO_BS" ? `Fondo ${bs(turno.fondoBs)} + ventas ${bs(turno.efectivoBs)} − vuelto ${bs(turno.vueltoBs)}${movTexto("VES")}`
    : (turno.comisionAvancesBs || 0) > 0 || (turno.movimientos || []).some((x) => x.tipo === "AVANCE") ? "Ventas, avances y abonos del turno" : "Lo cobrado en el turno";

  const siguiente = (i: number) => {
    const nx = inputs.current[i + 1];
    if (nx) nx.focus(); else obsRef.current?.focus();
  };

  const cerrar = async () => {
    if (cerrando) return;
    if (!a.listo && !confirmar) {
      setConfirmar(true);
      setAviso("Te falta contar: " + a.filas.filter((f) => f.estado === "sin-contar").map((f) => INFO[f.metodo]?.n || f.metodo).join(", ") + ". Cuéntalas o pulsa “Cerrar igual”.");
      return;
    }
    setCerrando(true); setErr("");
    try {
      const efUsd = a.filas.find((f) => f.metodo === "EFECTIVO_USD")?.contado ?? 0;
      const efBs = a.filas.find((f) => f.metodo === "EFECTIVO_BS")?.contado ?? 0;
      const det = JSON.stringify(a.filas.map((f) => ({ metodo: f.metodo, moneda: f.moneda, esperado: f.esperado, contado: f.contado, diferencia: f.diferencia })));
      await cerrarTurno(turno.turnoId, efUsd, efBs, det, obs);
      setTurnoId(null); avisarTurno();
      setCerrado({ turnoId: turno.turnoId, filas: a.filas, difUsd: a.diferenciaUsd, obs });
      setAviso(""); setConfirmar(false);
    } catch (e) { setErr((e as Error).message); }
    finally { setCerrando(false); }
  };

  const onKey = (i: number, f: FilaArqueo) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cerrar(); }
    else if (e.key === "Enter") { e.preventDefault(); siguiente(i); }
    else if (e.key === "F8" && !f.digital) { e.preventDefault(); setCalc({ moneda: f.moneda, destino: "arqueo" }); }
  };

  return (
    <div className="czwrap wide">
      <div className="cz-top">
        <span className="cz-tag"><b>Turno #{turno.turnoId}</b></span>
        <span className="pill ok"><i />Abierto</span>
        <span className="cz-sp" />
        <button className="btn2 press cz-ref" onClick={refrescar}>Actualizar</button>
      </div>

      <div className="cz-kpis">
        <div className="cz-kpi"><span className="k">Fondo inicial</span><b className="t">{usd(turno.fondoUsd)}</b><span className="d t">{bs(turno.fondoBs)}</span></div>
        <div className="cz-kpi"><span className="k">Ventas en efectivo</span><b className="t">{usd(turno.efectivoUsd)}</b><span className="d t">{bs(turno.efectivoBs)}</span></div>
        <div className="cz-kpi"><span className="k">Pagos digitales</span><b className="t">{bs(digital)}</b><span className="d">Pago móvil + Punto + Biopago</span></div>
        <div className="cz-kpi hl"><span className="k">Esperado en gaveta</span><b className="t">{usd(turno.esperadoUsd)}</b><span className="d t">{bs(turno.esperadoBs)}</span></div>
        {((turno.fiadoUsd || 0) > 0 || (turno.comisionAvancesBs || 0) > 0) && (
          <div className="cz-kpi"><span className="k">Fiado · avances</span><b className="t">{usd(turno.fiadoUsd || 0)}</b><span className="d t">fiado · ganancia avances {bs(turno.comisionAvancesBs || 0)}</span></div>
        )}
      </div>

      <MovimientosCaja turnoId={turno.turnoId} tasa={tasa} onCambio={refrescar} />

      <div className="card arq">
        <div className="arq-head">
          <div><h3 className="h3">Cuenta cada forma de pago</h3><span className="hint">Escribe lo que tienes en la mano. La app te dice si cuadra. <span className="kbtip">Enter: siguiente · F8: contar billetes · Ctrl+Enter: cerrar</span></span></div>
          <div className="arq-prog"><span>{a.contadas} de {a.requeridas} contadas</span><div className="progress"><i style={{ width: (a.requeridas ? (a.contadas / a.requeridas) * 100 : 0) + "%", background: "var(--primary)" }} /></div></div>
        </div>
        <div className="arq-table">
          <div className="arq-row arq-th"><span>Forma de pago</span><span>Debe haber</span><span>Contaste</span><span>Estado</span></div>
          {a.filas.map((f, i) => {
            const inf = INFO[f.metodo] || { n: f.metodo, icon: "cash", color: "var(--text-3)", donde: "" };
            return (
              <div className={"arq-row arq-" + f.estado} key={f.metodo}>
                <span className="arq-nm">
                  <span className="co2-ic" style={{ background: `color-mix(in srgb, ${inf.color} 15%, var(--surface))`, color: inf.color }}><UIcono k={inf.icon} sw={1.8} /></span>
                  <span><b>{inf.n}</b><small>{inf.donde}</small></span>
                </span>
                <span className="arq-esp" data-k="Debe haber"><b className="t">{fmt(f.moneda, f.esperado)}</b><small>{detalle(f.metodo)}</small></span>
                <span className="arq-in" data-k="Contaste">
                  <span className="inpw"><i>{f.moneda === "USD" ? "$" : "Bs"}</i>
                    <input ref={(el) => { inputs.current[i] = el; }} className="inp t" style={{ paddingLeft: f.moneda === "USD" ? 30 : 40 }} inputMode="decimal" placeholder="0,00"
                      value={cont[f.metodo] ?? ""} onChange={(e) => setCont({ ...cont, [f.metodo]: e.target.value.replace(/[^\d.,]/g, "") })}
                      onFocus={(e) => e.target.select()} onKeyDown={onKey(i, f)} aria-label={"Contado en " + inf.n} /></span>
                  {!f.digital && <button className="btn2 press" title="Contar billetes (F8)" onClick={() => setCalc({ moneda: f.moneda, destino: "arqueo" })}><UIcono k="bills" /><span className="lbl">Billetes</span></button>}
                </span>
                <span className="arq-st"><Estado f={f} /></span>
              </div>
            );
          })}
          <div className="arq-row arq-foot">
            <span><b>Total (todo en $)</b></span>
            <span className="t" data-k="Debe haber"><b>{usd(a.esperadoUsd)}</b></span>
            <span className="t" data-k="Contaste"><b>{usd(a.contadoUsd)}</b></span>
            <span>{a.contadas === 0 ? <span className="pill">Sin contar</span> : !a.listo ? <span className="pill soon"><i />Faltan {a.porContar} por contar</span> : a.diferenciaUsd === 0 ? <span className="pill ok"><i />Cuadra</span> : a.diferenciaUsd < 0 ? <span className="pill late"><i />Falta {usd(-a.diferenciaUsd)}</span> : <span className="pill info"><i />Sobra {usd(a.diferenciaUsd)}</span>}</span>
          </div>
        </div>
        {a.faltantes.length > 0 && (
          <div className="arq-alerta"><UIcono k="alert" sw={2} /><div><b>Revisa antes de cerrar</b>
            <span>{a.faltantes.map((f) => "Falta " + fmt(f.moneda, Math.abs(f.diferencia)) + " en " + (INFO[f.metodo]?.n || f.metodo)).join(" · ")}</span></div></div>
        )}
      </div>

      <div className="card cz-count">
        <label className="lbl">Observaciones del cierre <span className="opt">(opcional)</span>
          <textarea ref={obsRef} className="inp arq-obs" rows={2} maxLength={500} value={obs} placeholder="Ej: entregado al supervisor, sin novedades…" onChange={(e) => setObs(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); cerrar(); } }} />
        </label>
        {aviso && <p className="pinmsg err">{aviso}</p>}
        {err && <p className="pinmsg err">{err}</p>}
        <button className={"cta center press cz-cerrar" + (confirmar && !a.listo ? " warn" : "")} disabled={cerrando} onClick={cerrar}>
          <UIcono k="check" sw={2.2} />{cerrando ? "Cerrando…" : confirmar && !a.listo ? "Cerrar igual" : "Cerrar turno"} <kbd className="kb">Ctrl+Enter</kbd>
        </button>
      </div>

      {calc && <CalcBilletes moneda={calc.moneda} onClose={() => setCalc(null)}
        onUsar={(t) => { const k = calc.moneda === "USD" ? "EFECTIVO_USD" : "EFECTIVO_BS"; setCont({ ...cont, [k]: money(t) }); setCalc(null); setTimeout(() => inputs.current[a.filas.findIndex((f) => f.metodo === k)]?.focus(), 0); }} />}
    </div>
  );
}

/** Calculadora de billetes: cantidad × billete. Teclado: Enter usa el total, Esc cierra. */
function CalcBilletes({ moneda, onClose, onUsar }: { moneda: "USD" | "VES"; onClose: () => void; onUsar: (total: number) => void }) {
  const den = moneda === "USD" ? DEN_USD : DEN_BS;
  const f = moneda === "USD" ? usd : bs;
  const [cant, setCant] = useState<Record<number, string>>({});
  const primero = useRef<HTMLInputElement>(null);
  const n = (d: number) => parseInt(cant[d] || "0", 10) || 0;
  const total = Math.round(den.reduce((s, d) => s + d * n(d), 0) * 100) / 100;
  const paso = (d: number, inc: number) => setCant({ ...cant, [d]: String(Math.max(0, n(d) + inc)) });
  useEffect(() => { primero.current?.focus(); }, []);
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } else if (e.key === "Enter") { e.preventDefault(); onUsar(total); } }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Contar billetes {moneda === "USD" ? "($)" : "(Bs)"}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">Escribe cuántos billetes hay de cada uno. <span className="kbtip">Tab: siguiente · ↑↓: sumar/restar · Enter: usar total · Esc: cerrar</span></span>
          <div className="calc-rows">
            {den.map((d, i) => (
              <div className="calc-row" key={d}>
                <span className="bn t">{moneda === "USD" ? "$" : "Bs"} {d}</span>
                <div className="stp"><button tabIndex={-1} onClick={() => paso(d, -1)} aria-label="Menos">−</button>
                  <input ref={i === 0 ? primero : undefined} className="t" inputMode="numeric" value={cant[d] ?? ""} placeholder="0"
                    onChange={(e) => setCant({ ...cant, [d]: e.target.value.replace(/\D/g, "") })}
                    onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); paso(d, 1); } else if (e.key === "ArrowDown") { e.preventDefault(); paso(d, -1); } }}
                    aria-label={"Billetes de " + d} />
                  <button tabIndex={-1} onClick={() => paso(d, 1)} aria-label="Más">+</button></div>
                <span className="t sub">{n(d) ? f(d * n(d)) : "—"}</span>
              </div>
            ))}
          </div>
          <div className="calc-total"><span>Total contado</span><b className="t">{f(total)}</b></div>
        </div>
        <div className="modal-foot"><button className="cta center press" onClick={() => onUsar(total)}>Usar este total <kbd className="kb">Enter</kbd></button></div>
      </div>
    </div>
  );
}
