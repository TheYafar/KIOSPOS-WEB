import { useEffect, useState } from "react";
import { listarPlanes, mensualidadDe, type PlanV } from "../api";

const usd = (n: number) => "$ " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Tarjetas de planes + cuántas cajas, con la mensualidad a la vista. Lo usan el dueño y el super admin. */
export function ElegirPlan({ plan, cajas, onChange }: { plan: string; cajas: number; onChange: (plan: string, cajas: number) => void }) {
  const [planes, setPlanes] = useState<PlanV[]>([]);
  useEffect(() => { listarPlanes().then(setPlanes).catch(() => {}); }, []);
  const actual = planes.find((p) => p.codigo === plan) || planes[0];
  const elegir = (p: PlanV) => onChange(p.codigo, Math.min(Math.max(cajas, 1), p.maxCajas));
  if (!planes.length) return <div className="cb-loading">Cargando planes…</div>;
  return (
    <div className="eplan">
      <div className="eplan-cards" role="radiogroup" aria-label="Plan">
        {planes.map((p) => (
          <button key={p.codigo} type="button" role="radio" aria-checked={p.codigo === actual?.codigo} className={"eplan-card press" + (p.codigo === actual?.codigo ? " on" : "")} onClick={() => elegir(p)}>
            <b>{p.nombre}</b>
            <span className="eplan-precio t">{usd(p.precioBase)}<small>/mes</small></span>
            <span className="eplan-inc">{p.cajasIncluidas} {p.cajasIncluidas === 1 ? "caja incluida" : "cajas incluidas"} · caja extra {usd(p.precioCajaExtra)} · hasta {p.maxCajas}</span>
            <span className="eplan-desc">{p.descripcion}</span>
          </button>
        ))}
      </div>
      {actual && (
        <div className="eplan-cajas">
          <span>¿Cuántas cajas?</span>
          <div className="eplan-step">
            <button type="button" className="press" aria-label="Una caja menos" disabled={cajas <= 1} onClick={() => onChange(actual.codigo, cajas - 1)}>−</button>
            <b className="t" aria-label="Cajas">{cajas}</b>
            <button type="button" className="press" aria-label="Una caja más" disabled={cajas >= actual.maxCajas} onClick={() => onChange(actual.codigo, cajas + 1)}>+</button>
          </div>
          <span className="eplan-total">Mensualidad <b className="t">{usd(mensualidadDe(actual, cajas))}</b></span>
        </div>
      )}
    </div>
  );
}
