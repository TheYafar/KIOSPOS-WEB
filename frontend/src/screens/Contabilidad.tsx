import { TEXTO_SYNC, useDocServidor } from "../contabilidad-sync";
import { useEffect, useMemo, useState } from "react";
import { cierresDia, reporteDia, type CierreDia, type ReporteDia } from "../api";
import { getTasa } from "../session";
import {
  getHojas, getLibro, nuevoId, plantillasHoja, setHojas, setLibro,
  type EntradaLibro, type EntradaTipo, type Hoja
} from "../contabilidad-local";

const METODO: Record<string, string> = { EFECTIVO_USD: "Efectivo $", EFECTIVO_BS: "Efectivo Bs", PUNTO: "Punto", PAGO_MOVIL: "Pago móvil", BIOPAGO: "Biopago" };
const fmtN = (n: number) => (n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + fmtN(n);
const bs = (n: number) => "Bs " + fmtN(n);
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
const numOf = (s: string) => parseFloat(String(s || "").replace(/\./g, "").replace(",", ".")) || 0;
const horaCierre = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Caracas" }); }
  catch { return iso; }
};

function cuadrePill(diffUsd: number | null) {
  if (diffUsd == null) return <span className="cb-pill">Sin contar</span>;
  if (Math.abs(diffUsd) <= 0.009) return <span className="cb-pill ok"><i />Cuadró</span>;
  return diffUsd > 0
    ? <span className="cb-pill ok"><i />Sobró {usd(diffUsd)}</span>
    : <span className="cb-pill bad"><i />Faltó {usd(-diffUsd)}</span>;
}

export function Contabilidad() {
  const [modo, setModo] = useState<"auto" | "mano">("auto");
  const [sub, setSub] = useState<"lib" | "hoja">("lib");

  // --- Automática: datos reales ---
  const [rep, setRep] = useState<ReporteDia | null>(null);
  const [cierres, setCierres] = useState<CierreDia[] | null>(null);
  const [err, setErr] = useState("");
  const tasa = Number(getTasa()) || 1;

  useEffect(() => {
    reporteDia().then(setRep).catch((e) => setErr((e as Error).message));
    cierresDia().then(setCierres).catch(() => setCierres([]));
  }, []);

  // --- A mano: libreta (guardado local) ---
  const [libro, setLibroState] = useState<EntradaLibro[]>(() => getLibro());
  const commitLibro = (l: EntradaLibro[]) => { setLibroState(l); setLibro(l); };
  const syncLibro = useDocServidor<EntradaLibro[]>("libro", libro, (v) => { setLibroState(v); setLibro(v); }, (v): v is EntradaLibro[] => Array.isArray(v));

  const manT = useMemo(() => {
    let vendiste = 0, costo = 0, entradas = 0, gastos = 0;
    for (const e of libro) {
      if (e.tipo === "venta") { vendiste += e.vendio || 0; costo += e.costo || 0; }
      else if (e.tipo === "gasto") gastos += e.monto || 0;
      else entradas += e.monto || 0;
    }
    return { vendiste: r2(vendiste), costo: r2(costo), quedo: r2(vendiste - costo + entradas - gastos) };
  }, [libro]);

  const [fTipo, setFTipo] = useState<EntradaTipo>("venta");
  const [fOpen, setFOpen] = useState(false);
  const [fCon, setFCon] = useState("");
  const [fVen, setFVen] = useState("");
  const [fCos, setFCos] = useState("");
  const [fMon, setFMon] = useState("");

  const cerrarForm = () => { setFOpen(false); setFCon(""); setFVen(""); setFCos(""); setFMon(""); setFTipo("venta"); };
  const guardar = () => {
    const con = fCon.trim();
    if (fTipo === "venta") {
      const v = numOf(fVen);
      if (v <= 0) return;
      commitLibro([{ id: nuevoId(), fecha: "hoy", tipo: "venta", concepto: con || "Venta del día", vendio: v, costo: numOf(fCos) }, ...libro]);
    } else {
      const m = numOf(fMon);
      if (m <= 0) return;
      commitLibro([{ id: nuevoId(), fecha: "hoy", tipo: fTipo, concepto: con || (fTipo === "gasto" ? "Gasto" : "Entró aparte"), monto: m }, ...libro]);
    }
    cerrarForm();
  };
  const borrar = (id: string) => commitLibro(libro.filter((e) => e.id !== id));

  // --- A mano: hojas libres (guardado local) ---
  const [hojas, setHojasState] = useState<Hoja[]>(() => getHojas());
  const [activa, setActiva] = useState(0);
  const commitHojas = (h: Hoja[]) => { setHojasState(h); setHojas(h); };
  const syncHojas = useDocServidor<Hoja[]>("hojas", hojas, (v) => { setHojasState(v); setHojas(v); setActiva((a) => Math.min(a, Math.max(0, v.length - 1))); },
    (v): v is Hoja[] => Array.isArray(v) && v.length > 0 && v.every((h) => h && Array.isArray((h as Hoja).cols) && Array.isArray((h as Hoja).rows)));
  const [tasaHoja, setTasaHoja] = useState(String(Number(getTasa()) || 900));
  const rate = numOf(tasaHoja);

  const updHoja = (fn: (h: Hoja) => Hoja) => commitHojas(hojas.map((h, i) => (i === activa ? fn(h) : h)));
  const editCell = (ri: number, ci: number, val: string) => updHoja((h) => { const rows = h.rows.map((r) => r.slice()); rows[ri][ci] = val; return { ...h, rows }; });
  const renameCol = (ci: number, val: string) => updHoja((h) => { const cols = h.cols.map((c) => ({ ...c })); cols[ci].name = val; return { ...h, cols }; });
  const cycleCur = (ci: number) => updHoja((h) => { const cols = h.cols.map((c) => ({ ...c })); const c = cols[ci]; if (!c.money) { c.money = true; c.bs = false; } else if (!c.bs) c.bs = true; else { c.money = false; c.bs = false; } return { ...h, cols }; });
  const addRow = () => updHoja((h) => ({ ...h, rows: [...h.rows, h.cols.map(() => "")] }));
  const addCol = () => updHoja((h) => ({ ...h, cols: [...h.cols, { name: "Nueva", money: false }], rows: h.rows.map((r) => [...r, ""]) }));
  const delRow = (ri: number) => updHoja((h) => ({ ...h, rows: h.rows.filter((_, i) => i !== ri) }));
  const delCol = (ci: number) => updHoja((h) => (h.cols.length <= 1 ? h : { ...h, cols: h.cols.filter((_, i) => i !== ci), rows: h.rows.map((r) => r.filter((_, i) => i !== ci)) }));
  const loadTpl = (key: string) => { const t = plantillasHoja()[key]; updHoja((h) => ({ ...h, cols: t.cols.map((c) => ({ ...c })), rows: t.rows.map((r) => r.slice()) })); };
  const renameHoja = (val: string) => updHoja((h) => ({ ...h, name: val }));
  const addHoja = () => { const t = plantillasHoja().blank; const nh: Hoja = { id: nuevoId(), name: "Hoja " + (hojas.length + 1), cols: t.cols.map((c) => ({ ...c })), rows: t.rows.map((r) => r.slice()) }; const arr = [...hojas, nh]; commitHojas(arr); setActiva(arr.length - 1); };
  const delHoja = () => { if (hojas.length <= 1) return; const arr = hojas.filter((_, i) => i !== activa); commitHojas(arr); setActiva(Math.min(activa, arr.length - 1)); };

  const hoja = hojas[Math.min(activa, hojas.length - 1)] || hojas[0];
  const sumCol = (ci: number) => hoja.rows.reduce((s, r) => s + numOf(r[ci] || ""), 0);

  const exportar = () => {
    const esc = (s: string) => (/[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
    const lines: string[] = [];
    for (const h of hojas) {
      lines.push(esc(h.name));
      lines.push(h.cols.map((c) => esc(c.name)).join(";"));
      for (const r of h.rows) lines.push(h.cols.map((_, ci) => esc(r[ci] || "")).join(";"));
      lines.push("");
    }
    const csv = "﻿" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contabilidad-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  // --- Comparación automático vs. a mano ---
  const diffGan = rep ? r2(manT.quedo - rep.gananciaUsd) : 0;

  return (
    <div className="cb">
      <div className="cb-secttl">
        <h2>Contabilidad</h2>
        <div className="cb-seg cb-modo">
          <button className={modo === "auto" ? "on" : ""} onClick={() => setModo("auto")}>Automática</button>
          <button className={modo === "mano" ? "on" : ""} onClick={() => setModo("mano")}>A mano</button>
        </div>
      </div>
      <p className="cb-lead">
        {modo === "auto"
          ? "Lo que te dejó el negocio hoy. Sale solo de tus ventas y cierres — no anotas nada."
          : "Tú colocas todo: cada cierre y cada gasto. La app solo guarda y suma."}
      </p>

      {/* ===== AUTOMÁTICA ===== */}
      {modo === "auto" && (
        err ? <div className="cb-empty"><b>No se pudo cargar</b><p>{err}</p></div> :
        !rep ? <div className="cb-loading">Cargando…</div> : (
          <>
            <section className="cb-hero">
              <div className="cb-big">
                <span className="cb-k">Te quedó hoy (ganancia)</span>
                <span className="cb-v t">{usd(rep.gananciaUsd)}</span>
                <span className="cb-sub t">≈ {bs(rep.gananciaUsd * tasa)} · {(cierres?.length ?? 0)} {(cierres?.length ?? 0) === 1 ? "cierre" : "cierres"}</span>
              </div>
              <div className="cb-mini">
                <span className="cb-k"><span className="cb-dot" style={{ background: "var(--primary)" }} />Entró (vendido)</span>
                <span className="cb-v t">{usd(rep.totalUsd)}</span>
                <span className="cb-d t">≈ {bs(rep.totalBs)}</span>
              </div>
              <div className="cb-mini">
                <span className="cb-k"><span className="cb-dot" style={{ background: "var(--accent)" }} />Costó la mercancía</span>
                <span className="cb-v t">{usd(rep.costoUsd)}</span>
                <span className="cb-d">lo que repones</span>
              </div>
            </section>

            <div className="cb-explain">
              <b>Te quedó</b>&nbsp;= lo que vendiste ({usd(rep.totalUsd)}) menos lo que te costó la mercancía ({usd(rep.costoUsd)}).
            </div>

            <div className="cb-blk"><h3>Cierres de hoy</h3><span>{cierres?.length ?? 0} · todas las cajas</span></div>
            {cierres === null ? <div className="cb-loading">Cargando cierres…</div>
              : cierres.length === 0 ? <div className="cb-empty"><b>Aún no hay cierres hoy</b><p>Cuando cierres una caja aparecerá aquí su ganancia.</p></div>
              : (
                <div className="cb-cierres">
                  {cierres.map((c) => (
                    <details className="cb-cierre" key={c.turnoId}>
                      <summary>
                        <div className="cb-chora">{horaCierre(c.fechaCierre)}</div>
                        <div className="cb-cmid"><div className="caj">Cierre #{c.turnoId}</div><div className="meta">Caja {c.cajaId}</div></div>
                        <div className="cb-cnums"><span className="gan t">{usd(c.gananciaUsd)}</span><span className="ven t">vendió {usd(c.vendidoUsd)}</span></div>
                        <svg className="cb-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                      </summary>
                      <div className="cb-cbody">
                        <div className="cb-cuadre"><span className="lbl">¿Cuadró la gaveta? ($)</span>{cuadrePill(c.diferenciaUsd)}</div>
                        {c.diferenciaBs != null && Math.abs(c.diferenciaBs) > 0.9 && (
                          <div className="cb-cuadre"><span className="lbl">En bolívares</span>
                            <span className={"cb-pill " + (c.diferenciaBs >= 0 ? "ok" : "bad")}><i />{c.diferenciaBs >= 0 ? "Sobró" : "Faltó"} {bs(Math.abs(c.diferenciaBs))}</span>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}

            <div className="cb-blk"><h3>Cómo te pagaron hoy</h3><span>sumando todos los cierres</span></div>
            <section className="cb-pay">
              {rep.pagos.length === 0 ? <p className="cb-note">Sin ventas hoy.</p> : (() => {
                const max = Math.max(1, ...rep.pagos.map((p) => p.equivalenteUsd));
                return rep.pagos.map((p, i) => (
                  <div className="cb-prow" key={i}>
                    <span className="cb-pl">{METODO[p.metodo] || p.metodo}</span>
                    <span className="cb-pbar"><i style={{ width: Math.round((p.equivalenteUsd / max) * 100) + "%" }} /></span>
                    <span className="cb-pv t">{usd(p.equivalenteUsd)}</span>
                  </div>
                ));
              })()}
            </section>

            <div className="cb-blk"><h3>¿Cuadra con lo que contaste a mano?</h3><span>la app vs. tu libreta</span></div>
            <section className="cb-compara">
              <table className="cb-cmp">
                <thead><tr><th>Concepto</th><th>La app</th><th>A mano</th><th>Dif.</th></tr></thead>
                <tbody>
                  <tr><td className="cl">Vendido</td><td className="t">{usd(rep.totalUsd)}</td><td className="t">{usd(manT.vendiste)}</td><td className={"cd " + diffClass(manT.vendiste - rep.totalUsd)}>{diffTxt(manT.vendiste - rep.totalUsd)}</td></tr>
                  <tr><td className="cl">Reponer (costo)</td><td className="t">{usd(rep.costoUsd)}</td><td className="t">{usd(manT.costo)}</td><td className={"cd " + diffClass(manT.costo - rep.costoUsd)}>{diffTxt(manT.costo - rep.costoUsd)}</td></tr>
                  <tr><td className="cl">Ganancia</td><td className="t">{usd(rep.gananciaUsd)}</td><td className="t">{usd(manT.quedo)}</td><td className={"cd " + diffClass(diffGan)}>{diffTxt(diffGan)}</td></tr>
                </tbody>
              </table>
              <div className={"cb-verdict " + (Math.abs(diffGan) < 0.01 ? "ok" : "warn")}>
                {Math.abs(diffGan) < 0.01
                  ? "Cuadran: lo que contaste a mano coincide con la app."
                  : "Diferencia de " + usd(Math.abs(diffGan)) + " en la ganancia frente a la app. Revisa qué cambió."}
              </div>
              {libro.length === 0 && <p className="cb-note">Anota tus cuentas en <b>“A mano”</b> para comparar.</p>}
            </section>
          </>
        )
      )}

      {/* ===== A MANO ===== */}
      {modo === "mano" && (
        <>
          <div className="cb-seg cb-subseg">
            <button className={sub === "lib" ? "on" : ""} onClick={() => setSub("lib")}>Libreta guiada</button>
            <button className={sub === "hoja" ? "on" : ""} onClick={() => setSub("hoja")}>Hoja libre</button>
          </div>

          {sub === "lib" && (
            <>
              <div className="cb-banner">Aquí colocas <b>todo tú</b>: cada cierre, cada gasto. La app solo <b>guarda y suma</b>, en tu cuenta: lo ves desde cualquier equipo.</div>
              <span className={"cb-sync " + syncLibro} role="status">{TEXTO_SYNC[syncLibro]}</span>
              {!fOpen && <button className="cb-anotar" onClick={() => setFOpen(true)}>+ Anotar</button>}
              {fOpen && (
                <section className="cb-form">
                  <div className="ftit">¿Qué quieres anotar?</div>
                  <div className="cb-tipo3">
                    <button className={fTipo === "venta" ? "on" : ""} data-t="venta" onClick={() => setFTipo("venta")}>Un cierre / venta</button>
                    <button className={fTipo === "gasto" ? "on" : ""} data-t="gasto" onClick={() => setFTipo("gasto")}>Un gasto</button>
                    <button className={fTipo === "entrada" ? "on" : ""} data-t="entrada" onClick={() => setFTipo("entrada")}>Entró aparte</button>
                  </div>
                  <div className="cb-fld"><label>¿Qué fue? <span className="opt">(opcional)</span></label><input className="cb-inp" value={fCon} onChange={(e) => setFCon(e.target.value)} placeholder="Ej: Cierre de la tarde" /></div>
                  {fTipo === "venta" ? (
                    <div className="cb-two">
                      <div className="cb-fld"><label>¿Cuánto vendiste?</label><div className="cb-inpw"><i>$</i><input className="cb-inp t" inputMode="decimal" value={fVen} onChange={(e) => setFVen(e.target.value)} placeholder="0,00" /></div></div>
                      <div className="cb-fld"><label>¿Cuánto te costó?</label><div className="cb-inpw"><i>$</i><input className="cb-inp t" inputMode="decimal" value={fCos} onChange={(e) => setFCos(e.target.value)} placeholder="0,00" /></div></div>
                    </div>
                  ) : (
                    <div className="cb-fld"><label>¿Cuánto? (en $)</label><div className="cb-inpw"><i>$</i><input className="cb-inp t" inputMode="decimal" value={fMon} onChange={(e) => setFMon(e.target.value)} placeholder="0,00" /></div></div>
                  )}
                  <div className="cb-formacts">
                    <button className="cb-btn ghost" onClick={cerrarForm}>Cancelar</button>
                    <button className="cb-btn save" onClick={guardar}>Guardar</button>
                  </div>
                </section>
              )}

              <section className="cb-libro">
                {libro.length === 0 ? <div className="cb-empty"><b>Todavía no has anotado nada</b><p>Toca “Anotar” para empezar.</p></div>
                  : libro.map((e) => (
                    <div className="cb-entry" key={e.id}>
                      <div className="con"><b>{e.concepto}</b><span className="tp">{e.tipo === "venta" ? "Vendió · le costó " + usd(e.costo || 0) : e.tipo === "gasto" ? "Gasto" : "Entró aparte"}</span></div>
                      {e.tipo === "venta"
                        ? <span className="mon in t">+ {usd(e.vendio || 0)}<small>ganó {usd((e.vendio || 0) - (e.costo || 0))}</small></span>
                        : <span className={"mon t " + (e.tipo === "gasto" ? "out" : "in")}>{e.tipo === "gasto" ? "− " : "+ "}{usd(e.monto || 0)}</span>}
                      <button className="del" onClick={() => borrar(e.id)} aria-label="Borrar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                      </button>
                    </div>
                  ))}
              </section>

              <div className="cb-totales">
                <div className="cb-tot"><span className="k">Vendiste</span><span className="v t">{usd(manT.vendiste)}</span></div>
                <div className="cb-tot"><span className="k">Te costó</span><span className="v t">{usd(manT.costo)}</span></div>
                <div className="cb-tot quedo"><span className="k">Te quedó</span><span className="v t">{usd(manT.quedo)}</span></div>
              </div>
            </>
          )}

          {sub === "hoja" && (
            <>
              <div className="cb-banner">Tu propia hoja, como un <b>Excel sencillo</b>. Varias hojas con nombre, columnas propias, y exportar para tu copia de seguridad.</div>
              <span className={"cb-sync " + syncHojas} role="status">{TEXTO_SYNC[syncHojas]}</span>

              <div className="cb-hojas">
                {hojas.map((h, i) => (i === activa ? (
                  <span className="cb-tab active" key={h.id}>
                    <input className="cb-tabname" value={h.name} size={Math.max(4, h.name.length)} onChange={(e) => renameHoja(e.target.value)} aria-label="Nombre de la hoja" />
                    {hojas.length > 1 && <button className="x" onClick={delHoja} aria-label="Borrar hoja">✕</button>}
                  </span>
                ) : (
                  <button className="cb-tab" key={h.id} onClick={() => setActiva(i)}>{h.name}</button>
                )))}
                <button className="cb-tab add" onClick={addHoja}>+ hoja</button>
              </div>

              <div className="cb-plant">
                <span className="lbl">Cambiar esta hoja por una plantilla:</span>
                <div className="cb-chips">
                  <button onClick={() => loadTpl("caja")}>Caja del día</button>
                  <button onClick={() => loadTpl("gastos")}>Gastos del mes</button>
                  <button onClick={() => loadTpl("fiado")}>Fiado de clientes</button>
                  <button onClick={() => loadTpl("cuentas")}>Mis cuentas (reponer)</button>
                  <button onClick={() => loadTpl("blank")}>En blanco</button>
                </div>
              </div>

              <div className="cb-tasa">
                <label>Tasa del dólar hoy</label>
                <div className="cb-inpw"><i>Bs</i><input className="cb-inp t" inputMode="decimal" value={tasaHoja} onChange={(e) => setTasaHoja(e.target.value)} aria-label="Tasa del dólar" /></div>
                <span className="note">Pon una columna en <b>Bs</b> (toca el <b>$</b> del título hasta que diga Bs) y abajo verás el total en $.</span>
              </div>

              <div className="cb-sheetwrap">
                <table className="cb-sheet">
                  <thead>
                    <tr>
                      {hoja.cols.map((c, ci) => (
                        <th key={ci}>
                          <div className="col-head">
                            <input className="hname" value={c.name} onChange={(e) => renameCol(ci, e.target.value)} aria-label="Nombre de columna" />
                            <div className="col-tools">
                              <button className={"money" + (c.money ? " on" : "") + (c.bs ? " bs" : "")} onClick={() => cycleCur(ci)} title="$ dólares · Bs bolívares · toca para cambiar">{c.money ? (c.bs ? "Bs" : "$") : "$"}</button>
                              <button className="cdel" onClick={() => delCol(ci)} aria-label="Borrar columna">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                              </button>
                            </div>
                          </div>
                        </th>
                      ))}
                      <th style={{ width: 40 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {hoja.rows.map((row, ri) => (
                      <tr key={ri}>
                        {hoja.cols.map((c, ci) => (
                          <td key={ci} className={c.money ? "money" : ""}>
                            <input value={row[ci] || ""} inputMode={c.money ? "decimal" : undefined} onChange={(e) => editCell(ri, ci, e.target.value)} />
                          </td>
                        ))}
                        <td className="rowdel"><button onClick={() => delRow(ri)} aria-label="Borrar fila">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                        </button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      {hoja.cols.map((c, ci) => {
                        if (ci === 0) return <td key={ci}>Total</td>;
                        if (!c.money) return <td key={ci} />;
                        const s = sumCol(ci);
                        return <td key={ci} className="money">{c.bs ? <>{bs(s)}<small>≈ {usd(rate > 0 ? s / rate : 0)}</small></> : usd(s)}</td>;
                      })}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="cb-sheetacts">
                <button className="cb-btn ghost" onClick={addRow}>+ Fila</button>
                <button className="cb-btn ghost" onClick={addCol}>+ Columna</button>
              </div>
              <button className="cb-export" onClick={exportar}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 21h14" /></svg>
                Exportar a Excel (copia de seguridad)
              </button>
              <p className="cb-note">Baja un archivo <b>.csv</b> que abre en Excel. Toca un título para renombrar la columna; el signo <b>$</b> la suma (otra vez para Bs); el tacho borra fila o columna.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function diffClass(d: number) { return Math.abs(r2(d)) < 0.01 ? "ok" : d > 0 ? "up" : "down"; }
function diffTxt(d: number) { const x = r2(d); return Math.abs(x) < 0.01 ? "=" : (x > 0 ? "+ " : "− ") + fmtN(Math.abs(x)); }
