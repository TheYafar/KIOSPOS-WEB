import { useEffect, useState } from "react";
import { listarProductos, reporteDia, reporteRango, type Producto, type ReporteDia } from "../api";
import { descargarCsv, rangoDe, reporteCsv, type Periodo } from "../reporte-export";
import { UIcono } from "../icons";
import { PrimerosPasos } from "./PrimerosPasos";
import { Cajeros } from "./Cajeros";

const usd = (n: number) => "$ " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bs = (n: number) => "Bs " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METODO: Record<string, string> = { EFECTIVO_USD: "Efectivo $", EFECTIVO_BS: "Efectivo Bs", PUNTO: "Punto", PAGO_MOVIL: "Pago móvil", BIOPAGO: "Biopago", OTRO: "Otras formas" };

export function Reportes({ onIr }: { onIr?: (tab: string) => void }) {
  const [r, setR] = useState<ReporteDia | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [err, setErr] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("hoy");

  useEffect(() => { listarProductos().then(setProductos).catch(() => {}); }, []);
  useEffect(() => {
    let vivo = true;
    const { desde, hasta } = rangoDe(periodo);
    (periodo === "hoy" ? reporteDia() : reporteRango(desde, hasta))
      .then((x) => { if (vivo) { setR(x); setErr(""); } }).catch((e) => { if (vivo) setErr((e as Error).message); });
    return () => { vivo = false; };
  }, [periodo]);

  if (err) return <div className="empty"><b>No se pudo cargar</b><p>{err}</p></div>;
  if (!r) return <div className="stub">Cargando…</div>;
  const NOMBRE_P: Record<Periodo, string> = { hoy: "hoy", semana: "en los últimos 7 días", mes: "este mes" };
  const exportar = () => descargarCsv(`reporte-${r.fecha}${r.hasta && r.hasta !== r.fecha ? "_" + r.hasta : ""}.csv`, reporteCsv(r));

  const maxPago = Math.max(1, ...r.pagos.map((p) => p.equivalenteUsd));
  const margen = r.totalUsd > 0 ? Math.round((r.gananciaUsd / r.totalUsd) * 100) : 0;
  const ticketProm = r.cantidadVentas > 0 ? r.totalUsd / r.cantidadVentas : 0;
  const agotados = productos.filter((p) => p.stockActual <= 0);
  const bajos = productos.filter((p) => p.stockActual > 0 && p.stockActual <= p.stockMinimo);
  const sinAlertas = agotados.length === 0 && bajos.length === 0;
  const nombres = (ps: Producto[]) => ps.slice(0, 3).map((p) => p.nombre).join(", ") + (ps.length > 3 ? " +" + (ps.length - 3) : "");

  return (
    <div className="caja">
      <div className="scroll pad rep">
        {onIr && <PrimerosPasos onIr={onIr} />}
        {onIr && <Cajeros onIrEquipo={() => onIr("mas")} />}
        <div className="rep-bar">
          <div className="seg rep-per" role="tablist" aria-label="Período">
            {(["hoy", "semana", "mes"] as Periodo[]).map((p) => (
              <button key={p} role="tab" aria-selected={periodo === p} className={periodo === p ? "on" : ""} onClick={() => setPeriodo(p)}>{p === "hoy" ? "Hoy" : p === "semana" ? "Semana" : "Mes"}</button>
            ))}
          </div>
          <button className="btn2 press" onClick={exportar}><UIcono k="recibo" />Exportar a Excel</button>
        </div>
        <div className="rep-row">
          <div className="card rep-hero">
            <b style={{ opacity: .85 }}>Vendido {NOMBRE_P[periodo]}</b>
            <span className="rep-big t">{usd(r.totalUsd)}</span>
            <span style={{ opacity: .8, fontSize: 13 }}>{r.cantidadVentas} {r.cantidadVentas === 1 ? "venta" : "ventas"} · {bs(r.totalBs)}</span>
          </div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}><UIcono k="cash" /></span>
            <div><span className="k">Ganancia</span><span className="v t" style={{ color: "var(--ok)" }}>{usd(r.gananciaUsd)}</span><span className="d">{margen}% sobre la venta</span></div></div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--accent-soft)", color: "var(--warn)" }}><UIcono k="chart" /></span>
            <div><span className="k">Ticket promedio</span><span className="v t">{usd(ticketProm)}</span><span className="d">Por venta</span></div></div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="box" /></span>
            <div><span className="k">Costo de lo vendido</span><span className="v t">{usd(r.costoUsd)}</span><span className="d">Al costo de cuando se vendió</span></div></div>
        </div>

        {r.porDia && r.porDia.length > 1 && <VentasPorDia dias={r.porDia} />}

        <div className="rep-cols">
          <div className="card">
            <h3>Más vendidos</h3>
            {!r.masVendidos || r.masVendidos.length === 0 ? <p className="d" style={{ padding: "14px 0", color: "var(--text-3)" }}>Sin ventas en este período.</p> : (
              <ol className="rep-top">
                {r.masVendidos.map((m, i) => (
                  <li key={(m.productoId ?? "x") + m.nombre}>
                    <span className="rep-top-n t">{i + 1}</span>
                    <span className="grow"><b>{m.nombre}</b><small className="t">{String(m.cantidad).replace(".", ",")} vendidos · ganancia {usd(m.gananciaUsd)}</small></span>
                    <b className="t">{usd(m.vendidoUsd)}</b>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {(r.cantidadRecargas ?? 0) > 0 || (r.comisionAvancesBs ?? 0) > 0 ? (
            <div className="card">
              <h3>Recargas y avances</h3>
              <div className="mrows">
                {(r.cantidadRecargas ?? 0) > 0 && <div className="mrow rep-kv"><span className="ml">Recargas ({r.cantidadRecargas})</span><span className="mv t">{bs(r.recargasBs ?? 0)}</span></div>}
                {(r.cantidadRecargas ?? 0) > 0 && <div className="mrow rep-kv"><span className="ml">Ganancia de recargas</span><span className="mv t" style={{ color: "var(--ok)" }}>{bs(r.comisionRecargasBs ?? 0)}</span></div>}
                {(r.comisionAvancesBs ?? 0) > 0 && <div className="mrow rep-kv"><span className="ml">Ganancia de avances</span><span className="mv t" style={{ color: "var(--ok)" }}>{bs(r.comisionAvancesBs ?? 0)}</span></div>}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rep-cols">
          <div className="card">
            <h3>Necesita tu atención</h3>
            {sinAlertas && <p className="d" style={{ padding: "14px 0", color: "var(--text-3)" }}>Todo en orden. Sin productos agotados ni bajo mínimo.</p>}
            {agotados.length > 0 && (
              <div className="rep-alert"><span className="ibox" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}><UIcono k="box" /></span>
                <div className="grow"><b>{agotados.length} {agotados.length === 1 ? "producto agotado" : "productos agotados"}</b><span className="d">{nombres(agotados)}</span></div></div>
            )}
            {agotados.length > 0 && bajos.length > 0 && <div className="divider" />}
            {bajos.length > 0 && (
              <div className="rep-alert"><span className="ibox" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}><UIcono k="alert" /></span>
                <div className="grow"><b>{bajos.length} con poco stock</b><span className="d">{nombres(bajos)}</span></div></div>
            )}
          </div>

          <div className="card">
            <h3>Cómo te pagaron</h3>
            {r.pagos.length === 0 ? <p className="d" style={{ padding: "14px 0", color: "var(--text-3)" }}>Sin ventas en este período.</p> : (
              <div className="mrows">
                {r.pagos.map((p, i) => (
                  <div className="mrow" key={i}>
                    <span className="ml">{METODO[p.metodo] || p.metodo}</span>
                    <span className="mbar"><i style={{ width: Math.round((p.equivalenteUsd / maxPago) * 100) + "%" }} /></span>
                    <span className="mv t">{usd(p.equivalenteUsd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="hint" style={{ textAlign: "center", marginTop: 4 }}>Resumen de todas las cajas de tu negocio{periodo === "hoy" ? ", hoy" : " (" + r.fecha + " al " + (r.hasta || r.fecha) + ")"}.</p>
      </div>
    </div>
  );
}

/** Barras de venta por día (una serie: sin leyenda; el título la nombra). Pasar el dedo/ratón muestra el detalle. */
function VentasPorDia({ dias }: { dias: { fecha: string; cantidadVentas: number; totalUsd: number; gananciaUsd: number }[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...dias.map((d) => d.totalUsd));
  const etiqueta = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-VE", dias.length > 8 ? { day: "numeric" } : { weekday: "short", day: "numeric" });
  const d = sel != null ? dias[sel] : null;
  return (
    <div className="card rep-dias">
      <div className="rep-dias-h"><h3>Venta por día</h3>
        <span className="d t" aria-live="polite">{d ? `${new Date(d.fecha + "T12:00:00").toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "short" })}: ${usd(d.totalUsd)} · ganancia ${usd(d.gananciaUsd)} · ${d.cantidadVentas} ventas` : "Toca una barra para ver el detalle"}</span>
      </div>
      <div className="rep-plot" role="img" aria-label="Venta por día">
        {dias.map((x, i) => (
          <button key={x.fecha} className={"rep-col" + (sel === i ? " on" : "")} onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onClick={() => setSel(i)}
            aria-label={`${x.fecha}: ${usd(x.totalUsd)}`}>
            <span className="rep-bar-w"><i style={{ height: Math.max(2, Math.round((x.totalUsd / max) * 100)) + "%" }} /></span>
            <small>{etiqueta(x.fecha)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
