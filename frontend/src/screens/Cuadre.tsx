import { useEffect, useState } from "react";
import { abrirTurno, cerrarTurno, resumenTurno, type TurnoResumen } from "../api";
import { getTasa, getTurnoId, setTurnoId } from "../session";
import { UIcono } from "../icons";

// Cierre de caja en UNA sola pantalla, como el KioskPOS de escritorio
// (CashRegisterController): números del turno arriba, desglose efectivo vs. digital
// al medio, y abajo lo contado con la diferencia en vivo + calculadora de billetes.

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
/** "1.234,50" o "1234.50" o "50,5" -> número. Con coma: los puntos son miles. */
const numOf = (s: string) => {
  const t = (s || "").trim();
  if (!t) return 0;
  const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return parseFloat(norm) || 0;
};

const DEN_USD = [100, 50, 20, 10, 5, 2, 1];
const DEN_BS = [500, 200, 100, 50, 20, 10, 5];

/** Estado de la diferencia, igual que el escritorio: exacto / sobrante / faltante. */
function Badge({ diff, isBs }: { diff: number; isBs: boolean }) {
  const d = r2(diff);
  const f = isBs ? bs : usd;
  if (d === 0) return <span className="pill ok"><i />Cuadre exacto</span>;
  if (d > 0) return <span className="pill info"><i />Sobrante {f(d)}</span>;
  return <span className="pill late"><i />Faltante {f(Math.abs(d))}</span>;
}

export function Cuadre() {
  const [turno, setTurno] = useState<TurnoResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fUsd, setFUsd] = useState("20");
  const [fBs, setFBs] = useState("0");
  const [cUsd, setCUsd] = useState("");
  const [cBs, setCBs] = useState("");
  const [calc, setCalc] = useState<null | "USD" | "VES">(null);
  const [cerrado, setCerrado] = useState<TurnoResumen | null>(null);
  const [err, setErr] = useState("");
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    const id = getTurnoId();
    if (id) resumenTurno(id).then((t) => { setTurno(t); setCargando(false); }).catch(() => { setTurnoId(null); setCargando(false); });
    else setCargando(false);
  }, []);

  const abrir = async () => {
    try {
      const t = await abrirTurno(numOf(fUsd), numOf(fBs));
      setTurnoId(t.turnoId); setTurno(t); setErr("");
    } catch (e) { setErr((e as Error).message); }
  };

  const refrescar = async () => {
    if (!turno) return;
    try { setTurno(await resumenTurno(turno.turnoId)); setErr(""); } catch (e) { setErr((e as Error).message); }
  };

  const cerrar = async () => {
    if (!turno) return;
    setCerrando(true);
    try {
      const r = await cerrarTurno(turno.turnoId, numOf(cUsd), numOf(cBs));
      setTurnoId(null); setCerrado(r); setErr("");
    } catch (e) { setErr((e as Error).message); }
    finally { setCerrando(false); }
  };

  const nuevo = () => { setCerrado(null); setTurno(null); setCUsd(""); setCBs(""); };

  if (cargando) return <div className="stub">Cargando…</div>;

  // ----- Resultado del cierre -----
  if (cerrado) {
    const dU = cerrado.diferenciaUsd ?? 0, dB = cerrado.diferenciaBs ?? 0;
    return (
      <div className="czwrap wide">
        <div className="card czhero"><span className="ibox" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}><UIcono k="check" sw={2.4} /></span><div><b>Turno #{cerrado.turnoId} cerrado</b><span>Así quedó el cuadre de la gaveta.</span></div></div>
        <div className="cz-diffs">
          <div className="cz-diff"><span className="k">Dólares</span><b className="t">{usd(cerrado.declaradoUsd ?? 0)}</b><span className="d t">Debía haber {usd(cerrado.esperadoUsd)}</span><Badge diff={dU} isBs={false} /></div>
          <div className="cz-diff"><span className="k">Bolívares</span><b className="t">{bs(cerrado.declaradoBs ?? 0)}</b><span className="d t">Debía haber {bs(cerrado.esperadoBs)}</span><Badge diff={dB} isBs /></div>
        </div>
        <button className="cta center press" onClick={nuevo}>Listo</button>
      </div>
    );
  }

  // ----- Caja sin abrir -----
  if (!turno) {
    return (
      <div className="czwrap">
        <div className="card czhero"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="cash" sw={1.9} /></span><div><b>La caja está cerrada</b><span>Cuenta el fondo de la gaveta y ábrela para empezar a vender.</span></div></div>
        <div className="card fld"><span className="h3">¿Con cuánto abres?</span>
          <div className="two">
            <div className="inpw"><i>$</i><input className="inp pre t" value={fUsd} onChange={(e) => setFUsd(e.target.value)} inputMode="decimal" aria-label="Fondo en dólares" /></div>
            <div className="inpw"><i>Bs</i><input className="inp t" style={{ paddingLeft: 40 }} value={fBs} onChange={(e) => setFBs(e.target.value)} inputMode="decimal" aria-label="Fondo en bolívares" /></div>
          </div>
          <span className="hint">El fondo se suma una sola vez al cuadre.</span>
        </div>
        {err && <p className="pinmsg err">{err}</p>}
        <button className="cta center press" onClick={abrir}>Abrir caja</button>
      </div>
    );
  }

  // ----- Turno abierto: todo en una pantalla -----
  const dig = (m: string) => turno.metodos?.find((x) => x.metodo === m)?.esperado ?? 0;
  const pagoMovil = dig("PAGO_MOVIL"), punto = dig("PUNTO"), biopago = dig("BIOPAGO");
  const digital = r2(pagoMovil + punto + biopago);
  const diffUsd = r2(numOf(cUsd) - turno.esperadoUsd);
  const diffBs = r2(numOf(cBs) - turno.esperadoBs);
  const tasa = Number(getTasa()) || 0;

  return (
    <div className="czwrap wide">
      <div className="cz-top">
        <span className="cz-tag"><b>Turno #{turno.turnoId}</b></span>
        <span className="pill ok"><i />Abierto</span>
        <span className="cz-sp" />
        <button className="btn2 press cz-ref" onClick={refrescar}>Actualizar</button>
      </div>

      {/* KPIs del turno */}
      <div className="cz-kpis">
        <div className="cz-kpi"><span className="k">Fondo inicial</span><b className="t">{usd(turno.fondoUsd)}</b><span className="d t">{bs(turno.fondoBs)}</span></div>
        <div className="cz-kpi"><span className="k">Ventas en efectivo</span><b className="t">{usd(turno.efectivoUsd)}</b><span className="d t">{bs(turno.efectivoBs)}</span></div>
        <div className="cz-kpi"><span className="k">Pagos digitales</span><b className="t">{bs(digital)}</b><span className="d">Pago móvil + Punto + Biopago</span></div>
        <div className="cz-kpi hl"><span className="k">Esperado en gaveta</span><b className="t">{usd(turno.esperadoUsd)}</b><span className="d t">{bs(turno.esperadoBs)}</span></div>
      </div>

      {/* Desglose: efectivo físico vs. cobros digitales */}
      <div className="cz-cols">
        <div className="card cz-block">
          <h3 className="h3">Efectivo físico en gaveta</h3>
          <div className="cz-row"><span>Fondo inicial</span><b className="t">{usd(turno.fondoUsd)}{turno.fondoBs > 0 && <small> · {bs(turno.fondoBs)}</small>}</b></div>
          <div className="cz-row"><span>(+) Ventas efectivo $</span><b className="t">{usd(turno.efectivoUsd)}</b></div>
          <div className="cz-row"><span>(+) Ventas efectivo Bs</span><b className="t">{bs(turno.efectivoBs)}</b></div>
          <div className="cz-row"><span>(−) Vuelto entregado</span><b className="t neg">{usd(turno.vueltoUsd)}{turno.vueltoBs > 0 && <small> · {bs(turno.vueltoBs)}</small>}</b></div>
          <div className="cz-total"><span>Debe haber en gaveta</span><div><b className="t">{usd(turno.esperadoUsd)}</b><b className="t">{bs(turno.esperadoBs)}</b></div></div>
        </div>
        <div className="card cz-block">
          <h3 className="h3">Cobros digitales <small>(en cuenta bancaria)</small></h3>
          <div className="cz-row"><span>Pago móvil</span><b className="t">{bs(pagoMovil)}</b></div>
          <div className="cz-row"><span>Punto de venta</span><b className="t">{bs(punto)}</b></div>
          <div className="cz-row"><span>Biopago</span><b className="t">{bs(biopago)}</b></div>
          <div className="cz-total"><span>Total digital</span><div><b className="t">{bs(digital)}</b>{tasa > 0 && <small className="t">≈ {usd(digital / tasa)}</small>}</div></div>
          <span className="hint">No entra a la gaveta: compáralo con el cierre del punto y tu banco.</span>
        </div>
      </div>

      {/* Contar y cerrar */}
      <div className="card cz-count">
        <h3 className="h3">Cuenta el dinero de la gaveta y cierra el turno</h3>
        <div className="cz-fields">
          <div className="cz-field">
            <span className="k">Efectivo en dólares</span>
            <div className="cz-in">
              <div className="inpw"><i>$</i><input className="inp pre t" value={cUsd} onChange={(e) => setCUsd(e.target.value)} placeholder="0,00" inputMode="decimal" aria-label="Efectivo contado en dólares" /></div>
              <button className="btn2 press" onClick={() => setCalc("USD")}><UIcono k="bills" />Contar billetes</button>
            </div>
            <div className="cz-dline"><span>Diferencia <b className="t">{usd(diffUsd)}</b></span><Badge diff={diffUsd} isBs={false} /></div>
          </div>
          <div className="cz-field">
            <span className="k">Efectivo en bolívares</span>
            <div className="cz-in">
              <div className="inpw"><i>Bs</i><input className="inp t" style={{ paddingLeft: 40 }} value={cBs} onChange={(e) => setCBs(e.target.value)} placeholder="0,00" inputMode="decimal" aria-label="Efectivo contado en bolívares" /></div>
              <button className="btn2 press" onClick={() => setCalc("VES")}><UIcono k="bills" />Contar billetes</button>
            </div>
            <div className="cz-dline"><span>Diferencia <b className="t">{bs(diffBs)}</b></span><Badge diff={diffBs} isBs /></div>
          </div>
        </div>
        {err && <p className="pinmsg err">{err}</p>}
        <button className="cta center press cz-cerrar" disabled={cerrando} onClick={cerrar}><UIcono k="check" sw={2.2} />{cerrando ? "Cerrando…" : "Cerrar turno"}</button>
      </div>

      {calc && (
        <CalcBilletes moneda={calc} onClose={() => setCalc(null)}
          onUsar={(total) => { (calc === "USD" ? setCUsd : setCBs)(money(total)); setCalc(null); }} />
      )}
    </div>
  );
}

/** Calculadora de billetes por denominación (como el escritorio): cantidad × billete = total. */
function CalcBilletes({ moneda, onClose, onUsar }: { moneda: "USD" | "VES"; onClose: () => void; onUsar: (total: number) => void }) {
  const den = moneda === "USD" ? DEN_USD : DEN_BS;
  const fmt = moneda === "USD" ? usd : bs;
  const [cant, setCant] = useState<Record<number, string>>({});
  const n = (d: number) => parseInt(cant[d] || "0", 10) || 0;
  const total = r2(den.reduce((s, d) => s + d * n(d), 0));
  const paso = (d: number, inc: number) => setCant({ ...cant, [d]: String(Math.max(0, n(d) + inc)) });
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Contar billetes {moneda === "USD" ? "($)" : "(Bs)"}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div className="calc-rows">
            {den.map((d) => (
              <div className="calc-row" key={d}>
                <span className="bn t">{moneda === "USD" ? "$" : "Bs"} {d}</span>
                <div className="stp"><button onClick={() => paso(d, -1)} aria-label="Menos">−</button>
                  <input className="t" inputMode="numeric" value={cant[d] ?? ""} placeholder="0" onChange={(e) => setCant({ ...cant, [d]: e.target.value.replace(/\D/g, "") })} aria-label={"Billetes de " + d} />
                  <button onClick={() => paso(d, 1)} aria-label="Más">+</button></div>
                <span className="t sub">{n(d) ? fmt(d * n(d)) : "—"}</span>
              </div>
            ))}
          </div>
          <div className="calc-total"><span>Total contado</span><b className="t">{fmt(total)}</b></div>
        </div>
        <div className="modal-foot"><button className="cta center press" onClick={() => onUsar(total)}>Usar este total</button></div>
      </div>
    </div>
  );
}
