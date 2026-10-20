import { useEffect, useState } from "react";
import { reporteDia, type ReporteDia } from "../api";

const usd = (n: number) => "$ " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bs = (n: number) => "Bs " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METODO: Record<string, string> = { EFECTIVO_USD: "Efectivo $", EFECTIVO_BS: "Efectivo Bs", PUNTO: "Punto", PAGO_MOVIL: "Pago móvil", BIOPAGO: "Biopago" };

export function Reportes() {
  const [r, setR] = useState<ReporteDia | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { reporteDia().then(setR).catch((e) => setErr((e as Error).message)); }, []);

  if (err) return <div className="empty"><b>No se pudo cargar</b><p>{err}</p></div>;
  if (!r) return <div className="stub">Cargando…</div>;

  const maxPago = Math.max(1, ...r.pagos.map((p) => p.equivalenteUsd));
  const margen = r.totalUsd > 0 ? Math.round((r.gananciaUsd / r.totalUsd) * 100) : 0;

  return (
    <div className="caja">
      <div className="scroll pad">
        <div className="bx wide"><span className="k">Hoy vendiste</span><span className="v t">{usd(r.totalUsd)}</span>
          <span className="d t">{r.cantidadVentas} {r.cantidadVentas === 1 ? "venta" : "ventas"} · {bs(r.totalBs)}</span></div>
        <div className="bento">
          <div className="bx"><span className="k">Ganancia</span><span className="v t" style={{ color: "var(--ok)" }}>{usd(r.gananciaUsd)}</span><span className="d">{margen}% sobre la venta</span></div>
          <div className="bx"><span className="k">Costo de lo vendido</span><span className="v t">{usd(r.costoUsd)}</span></div>
        </div>
        <div className="bx wide">
          <span className="k">Cómo te pagaron</span>
          {r.pagos.length === 0 ? <span className="d">Sin ventas hoy.</span> : (
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
        <p className="hint" style={{ textAlign: "center", marginTop: 4 }}>Resumen del día de todas las cajas de tu negocio.</p>
      </div>
    </div>
  );
}
