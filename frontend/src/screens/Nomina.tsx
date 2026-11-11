import { useEffect, useState } from "react";
import { anularPagoNomina, historialNomina, pagarNomina, resumenNomina, type PagoNomina, type ResumenNomina, type TrabajadorNomina } from "../api";
import { getTasa } from "../session";
import { UIcono } from "../icons";
import { leerMonto } from "../arqueo";
import { FormCliente } from "./Clientes";
import { conectorDisponible, imprimirTicket } from "../conector";

// Nómina: pagarle a cada trabajador y, en el mismo paso, descontarle lo que debe de
// fiado. La cuenta se ve clara: sueldo + bonos − adelantos − fiado = lo que recibe.

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const METODOS = [["EFECTIVO_USD", "Efectivo $", "USD"], ["EFECTIVO_BS", "Efectivo Bs", "VES"], ["PAGO_MOVIL", "Pago móvil", "VES"],
  ["TRANSFERENCIA", "Transferencia", "VES"], ["ZELLE", "Zelle", "USD"], ["BINANCE", "Binance", "USD"]] as const;
const nombreMetodo = (m: string) => METODOS.find((x) => x[0] === m)?.[1] || m;
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" });

export function Nomina({ onIrFiado }: { onIrFiado: () => void }) {
  const [vista, setVista] = useState<"trabajadores" | "historial">("trabajadores");
  const [r, setR] = useState<ResumenNomina | null>(null);
  const [hist, setHist] = useState<{ pago: PagoNomina; trabajador: string }[]>([]);
  const [pagando, setPagando] = useState<TrabajadorNomina | null>(null);
  const [recibo, setRecibo] = useState<{ pago: PagoNomina; trabajador: string } | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [err, setErr] = useState("");
  const cargar = () => {
    resumenNomina().then((x) => { setR(x); setErr(""); }).catch((e) => setErr((e as Error).message));
    historialNomina().then(setHist).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);
  const ts = r?.trabajadores ?? [];

  return (
    <div className="caja">
      <div className="scroll pad cli">
        <div className="cli-head">
          <div><h2>Nómina</h2><p>Págale a cada trabajador. Lo que debe a crédito se descuenta solo del sueldo.</p></div>
          <button className="btn primary press" onClick={() => setNuevo(true)}><UIcono k="plus" sw={2.2} />Nuevo trabajador</button>
        </div>
        <div className="seg cli-tipo" role="tablist" aria-label="Trabajadores o historial">
          <button className={vista === "trabajadores" ? "on" : ""} onClick={() => setVista("trabajadores")}>Trabajadores</button>
          <button className={vista === "historial" ? "on" : ""} onClick={() => setVista("historial")}>Pagos hechos</button>
        </div>
        <div className="inv-stats nom-stats">
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="user" /></span>
            <div><span className="k">Sueldos por período</span><span className="v t">{usd(r?.totalSueldosUsd ?? 0)}</span><span className="d">{ts.filter((t) => t.activo).length} trabajador(es)</span></div></div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}><UIcono k="recibo" /></span>
            <div><span className="k">Deben a crédito</span><span className={"v t" + ((r?.totalFiadoUsd ?? 0) > 0 ? " mg-bad" : "")}>{usd(r?.totalFiadoUsd ?? 0)}</span><span className="d">se descuenta al pagar</span></div></div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}><UIcono k="cash" /></span>
            <div><span className="k">Pagado este mes</span><span className="v t">{usd(r?.pagadoEsteMesUsd ?? 0)}</span></div></div>
        </div>
        {err && <p className="noresult">{err}</p>}

        {vista === "trabajadores" ? (
          <div className="nom-list">
            {ts.map((t) => (
              <div key={t.id} className={"card nom-card" + (t.activo ? "" : " off")}>
                <div className="nom-top">
                  <span className="neg-av" style={{ ["--av" as string]: "var(--c-bebidas)" }}>{t.nombre.charAt(0).toUpperCase()}</span>
                  <div className="grow" style={{ minWidth: 0 }}><b>{t.nombre}</b><div className="d">{t.ultimoPago ? "Último pago: " + (t.ultimoPeriodo || "") + " · " + fecha(t.ultimoPago) : "Aún no se le ha pagado"}</div></div>
                </div>
                <div className="nom-cuenta">
                  <div><span>Sueldo</span><b className="t">{usd(t.sueldoUsd)}</b></div>
                  <div className={t.debeFiadoUsd > 0 ? "bad" : ""}><span>− Debe a crédito</span><b className="t">{usd(t.debeFiadoUsd)}</b></div>
                  <div className="neto"><span>Recibiría</span><b className="t">{usd(t.netoSugeridoUsd)}</b></div>
                </div>
                {t.debeFiadoUsd > t.sueldoUsd && t.sueldoUsd > 0 && <span className="hint mg-bad">Debe más que su sueldo: el resto queda para el próximo pago.</span>}
                <div className="nom-acc">
                  <button className="btn2 press" onClick={onIrFiado}>Ver su crédito</button>
                  <button className="btn primary press" disabled={!t.activo} onClick={() => setPagando(t)}>Pagar nómina</button>
                </div>
              </div>
            ))}
            {r && ts.length === 0 && <p className="noresult">Aún no tienes trabajadores. Anota el primero con su sueldo: lo que se lleve a crédito se le descuenta aquí al pagarle.</p>}
          </div>
        ) : (
          <div className="vt-list">
            {hist.map(({ pago: p, trabajador }) => (
              <button key={p.id} className={"card vt-row press" + (p.estado === "ANULADO" ? " anulada" : "")} onClick={() => setRecibo({ pago: p, trabajador })}>
                <span className="vt-n t">{fecha(p.createdAt)}</span>
                <span className="vt-tx"><b>{trabajador} · {p.periodo}{p.estado === "ANULADO" && <span className="pill bad vt-pill">Anulado</span>}</b><small>{nombreMetodo(p.metodo)}{p.fiadoDescontadoUsd > 0 ? " · crédito descontado " + usd(p.fiadoDescontadoUsd) : ""}</small></span>
                <span className="vt-m"><b className="t">{usd(p.netoUsd)}</b>{p.moneda === "VES" && <small className="t">{bs(p.montoPagado)}</small>}</span>
              </button>
            ))}
            {hist.length === 0 && <p className="noresult">Todavía no hay pagos de nómina.</p>}
          </div>
        )}
      </div>
      {pagando && <FormPagoNomina t={pagando} onClose={() => setPagando(null)} onPagado={(x) => { setPagando(null); setRecibo(x); cargar(); }} />}
      {recibo && <Recibo r={recibo} onClose={() => setRecibo(null)} onAnulado={(x) => { setRecibo(x); cargar(); }} />}
      {nuevo && <FormCliente trabajador onClose={() => setNuevo(false)} onSaved={() => { setNuevo(false); cargar(); }} />}
    </div>
  );
}

function FormPagoNomina({ t, onClose, onPagado }: { t: TrabajadorNomina; onClose: () => void; onPagado: (x: { pago: PagoNomina; trabajador: string }) => void }) {
  const hoy = new Date();
  const mes = hoy.toLocaleDateString("es-VE", { month: "long" });
  const sugerencias = [(hoy.getDate() <= 15 ? "1ra" : "2da") + " quincena de " + mes, "Semana del " + hoy.toLocaleDateString("es-VE", { day: "numeric", month: "short" }), "Mes de " + mes];
  const [periodo, setPeriodo] = useState(sugerencias[0]);
  const [sueldo, setSueldo] = useState(t.sueldoUsd ? money(t.sueldoUsd) : "");
  const [bonos, setBonos] = useState("");
  const [otros, setOtros] = useState("");
  const [concepto, setConcepto] = useState("");
  const s = leerMonto(sueldo) ?? 0, b = leerMonto(bonos) ?? 0, o = leerMonto(otros) ?? 0;
  const maxFiado = Math.max(0, Math.min(t.debeFiadoUsd, s + b - o));
  const [fiadoTxt, setFiadoTxt] = useState<string | null>(null); // null = todo lo que se pueda
  const fiado = fiadoTxt == null ? r2(maxFiado) : Math.min(leerMonto(fiadoTxt) ?? 0, t.debeFiadoUsd);
  const neto = r2(s + b - o - fiado);
  const [metodo, setMetodo] = useState<string>("EFECTIVO_USD");
  const [refe, setRefe] = useState("");
  const [err, setErr] = useState("");
  const [enviando, setEnviando] = useState(false);
  const tasa = Number(getTasa()) || 0;
  const enBs = METODOS.find((x) => x[0] === metodo)?.[2] === "VES";
  const ok = periodo.trim() && s >= 0 && neto >= 0 && !enviando;
  const pagar = async () => {
    if (!ok) return;
    setEnviando(true); setErr("");
    try {
      onPagado(await pagarNomina({ trabajadorId: t.id, periodo: periodo.trim(), sueldoUsd: s, bonosUsd: b, otrosDescuentosUsd: o, conceptoDescuentos: concepto.trim() || undefined,
        fiadoDescontadoUsd: r2(fiado), metodo, ...(enBs ? { tasa } : {}), ...(refe.trim() ? { referencia: refe.trim() } : {}) }));
    } catch (e) { setErr((e as Error).message); setEnviando(false); }
  };
  const campo = (label: string, v: string, set: (x: string) => void, aria: string, ph = "0,00") => (
    <label className="lbl">{label}<div className="inpw"><i>$</i><input className="inp t pre" inputMode="decimal" placeholder={ph} value={v} onChange={(e) => set(e.target.value.replace(/[^\d.,]/g, ""))} aria-label={aria} /></div></label>
  );
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card nom-pago" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
        <div className="modal-head"><h2>Pagar a {t.nombre}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <label className="lbl">Período que le pagas
            <input className="inp" value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período" />
            <div className="chips">{sugerencias.map((x) => <button key={x} className={"chip press" + (periodo === x ? " on" : "")} onClick={() => setPeriodo(x)}>{x}</button>)}</div>
          </label>
          <div className="two">
            {campo("Sueldo", sueldo, setSueldo, "Sueldo")}
            {campo("Bonos / extras (+)", bonos, setBonos, "Bonos")}
          </div>
          <div className="two">
            {campo("Adelantos u otros descuentos (−)", otros, setOtros, "Otros descuentos")}
            <label className="lbl">Concepto del descuento<input className="inp" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Opcional: adelanto del lunes" aria-label="Concepto de los descuentos" /></label>
          </div>
          <div className="nom-fiado">
            <div><b>Descontar su crédito</b><small>Debe {usd(t.debeFiadoUsd)}. Se le baja de su cuenta en Crédito.</small></div>
            <div className="inpw"><i>$</i><input className="inp t pre" inputMode="decimal" value={fiadoTxt ?? money(r2(maxFiado))} onChange={(e) => setFiadoTxt(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Fiado a descontar" disabled={t.debeFiadoUsd <= 0} /></div>
          </div>
          <div className="nom-calc">
            <div><span>Sueldo</span><b className="t">{usd(s)}</b></div>
            {b > 0 && <div><span>+ Bonos</span><b className="t">{usd(b)}</b></div>}
            {o > 0 && <div><span>− {concepto.trim() || "Otros descuentos"}</span><b className="t">{usd(o)}</b></div>}
            {fiado > 0 && <div className="bad"><span>− Crédito</span><b className="t">{usd(fiado)}</b></div>}
            <div className={"neto" + (neto < 0 ? " bad" : "")}><span>Recibe</span><b className="t">{usd(neto)}</b>{enBs && <small className="t">{bs(r2(neto * tasa))} (tasa {money(tasa)})</small>}</div>
          </div>
          <div className="lbl">¿Cómo le pagas?
            <div className="seg cli-met">{METODOS.map(([id, n]) => <button key={id} className={metodo === id ? "on" : ""} onClick={() => setMetodo(id)}>{n}</button>)}</div>
          </div>
          {metodo !== "EFECTIVO_USD" && metodo !== "EFECTIVO_BS" && <input className="inp" value={refe} onChange={(e) => setRefe(e.target.value)} placeholder="Referencia (opcional)" aria-label="Referencia del pago" />}
          <span className="hint">Este pago no sale de la caja: es lo que tú le pagas por fuera.</span>
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!ok} onClick={pagar}>{enviando ? "Guardando…" : "Pagar " + usd(neto) + (enBs ? " · " + bs(r2(neto * tasa)) : "")}</button></div>
      </div>
    </div>
  );
}

/** Recibo del pago de nómina (40 columnas para imprimir con el Conector). */
function Recibo({ r, onClose, onAnulado }: { r: { pago: PagoNomina; trabajador: string }; onClose: () => void; onAnulado?: (x: { pago: PagoNomina; trabajador: string }) => void }) {
  const p = r.pago;
  const [aviso, setAviso] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const anulado = p.estado === "ANULADO";
  const anular = async () => {
    if (!motivo.trim()) { setAviso("Escribe por qué lo anulas."); return; }
    try { const x = await anularPagoNomina(p.id, motivo.trim()); setAnulando(false); setAviso(""); onAnulado?.(x); }
    catch (e) { setAviso((e as Error).message); }
  };
  const w = 40, pad = (l: string, d: string) => (l.length + d.length >= w ? (l + " " + d).slice(0, w) : l + " ".repeat(w - l.length - d.length) + d);
  const cen = (s: string) => " ".repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s;
  const lineas = [cen("RECIBO DE PAGO DE NOMINA"), cen(fecha(p.createdAt)), "-".repeat(w), "Trabajador: " + r.trabajador, "Periodo: " + p.periodo, "-".repeat(w),
    pad("Sueldo", usd(p.sueldoUsd)), ...(p.bonosUsd > 0 ? [pad("+ Bonos", usd(p.bonosUsd))] : []),
    ...(p.otrosDescuentosUsd > 0 ? [pad("- " + (p.conceptoDescuentos || "Descuentos"), usd(p.otrosDescuentosUsd))] : []),
    ...(p.fiadoDescontadoUsd > 0 ? [pad("- Credito", usd(p.fiadoDescontadoUsd))] : []), "-".repeat(w), pad("RECIBE", usd(p.netoUsd)),
    ...(p.moneda === "VES" ? [pad("En bolivares", bs(p.montoPagado))] : []), pad("Forma de pago", nombreMetodo(p.metodo)), ...(p.referencia ? [pad("Ref.", p.referencia)] : []),
    "", "", "Firma: ______________________________"];
  const texto = lineas.join("\n");
  const imprimir = async () => {
    if (!(await conectorDisponible())) { setAviso("El Conector de impresión no está abierto en esta PC."); return; }
    try { await imprimirTicket(texto, false); setAviso("Recibo enviado a la impresora."); } catch (e) { setAviso((e as Error).message); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>{anulado ? "Pago anulado" : "Pago registrado ✓"}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          {anulado && <p className="pinmsg">Este pago se anuló{p.motivoAnulacion ? ": " + p.motivoAnulacion : ""}. {p.fiadoDescontadoUsd > 0 ? "El crédito que se había descontado volvió a su cuenta." : ""}</p>}
          <pre className={"nom-recibo t" + (anulado ? " anulado" : "")} aria-label="Recibo">{texto}</pre>
          {anulando && (
            <label className="fld">Motivo de la anulación
              <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: monto equivocado" onKeyDown={(e) => { if (e.key === "Enter") anular(); }} />
              <span className="hint">{p.fiadoDescontadoUsd > 0 ? "El crédito descontado (" + usd(p.fiadoDescontadoUsd) + ") vuelve a la cuenta del trabajador." : "El pago deja de contar en la nómina."}</span>
            </label>
          )}
          {aviso && <p className="pinmsg">{aviso}</p>}
        </div>
        <div className="modal-foot two-btn">
          {anulando ? <>
            <button className="btn2 big press" onClick={() => { setAnulando(false); setAviso(""); }}>Volver</button>
            <button className="btn danger big press" onClick={anular}>Anular pago</button>
          </> : <>
            {!anulado && onAnulado && <button className="btn2 big press nom-anular" onClick={() => setAnulando(true)}>Anular</button>}
            {!anulado && <button className="btn2 big press" onClick={imprimir}><UIcono k="print" />Imprimir recibo</button>}
            <button className="btn primary big press" onClick={onClose}>Listo</button>
          </>}
        </div>
      </div>
    </div>
  );
}
