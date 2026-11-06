import { useEffect, useState } from "react";
import { listarProductos, reporteDia, type Producto, type ReporteDia } from "../api";
import { UIcono } from "../icons";
import { PrimerosPasos } from "./PrimerosPasos";

const usd = (n: number) => "$ " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bs = (n: number) => "Bs " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METODO: Record<string, string> = { EFECTIVO_USD: "Efectivo $", EFECTIVO_BS: "Efectivo Bs", PUNTO: "Punto", PAGO_MOVIL: "Pago móvil", BIOPAGO: "Biopago" };

export function Reportes({ onIr }: { onIr?: (tab: string) => void }) {
  const [r, setR] = useState<ReporteDia | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    reporteDia().then(setR).catch((e) => setErr((e as Error).message));
    listarProductos().then(setProductos).catch(() => {});
  }, []);

  if (err) return <div className="empty"><b>No se pudo cargar</b><p>{err}</p></div>;
  if (!r) return <div className="stub">Cargando…</div>;

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
        <div className="rep-row">
          <div className="card rep-hero">
            <b style={{ opacity: .85 }}>Vendido hoy</b>
            <span className="rep-big t">{usd(r.totalUsd)}</span>
            <span style={{ opacity: .8, fontSize: 13 }}>{r.cantidadVentas} {r.cantidadVentas === 1 ? "venta" : "ventas"} · {bs(r.totalBs)}</span>
          </div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}><UIcono k="cash" /></span>
            <div><span className="k">Ganancia</span><span className="v t" style={{ color: "var(--ok)" }}>{usd(r.gananciaUsd)}</span><span className="d">{margen}% sobre la venta</span></div></div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--accent-soft)", color: "var(--warn)" }}><UIcono k="chart" /></span>
            <div><span className="k">Ticket promedio</span><span className="v t">{usd(ticketProm)}</span><span className="d">Por venta, hoy</span></div></div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="box" /></span>
            <div><span className="k">Costo de lo vendido</span><span className="v t">{usd(r.costoUsd)}</span><span className="d">Según el costo actual</span></div></div>
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
            {r.pagos.length === 0 ? <p className="d" style={{ padding: "14px 0", color: "var(--text-3)" }}>Sin ventas hoy.</p> : (
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
        <p className="hint" style={{ textAlign: "center", marginTop: 4 }}>Resumen del día de todas las cajas de tu negocio.</p>
      </div>
    </div>
  );
}
