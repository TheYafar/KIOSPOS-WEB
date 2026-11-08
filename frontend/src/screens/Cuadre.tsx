import { useEffect, useState } from "react";
import { abrirTurno, cerrarTurno, resumenTurno, type TurnoResumen } from "../api";
import { getTurnoId, setTurnoId } from "../session";
import { UIcono } from "../icons";

const DEN = [100, 50, 20, 10, 5, 2, 1];
const METODO_N: Record<string, string> = { EFECTIVO_USD: "Efectivo $", EFECTIVO_BS: "Efectivo Bs", PUNTO: "Punto", PAGO_MOVIL: "Pago móvil", BIOPAGO: "Biopago" };
const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const numOf = (s: string) => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0 : 0);

function pill(diff: number, isBs: boolean) {
  const tol = isBs ? 1 : 0.009;
  if (Math.abs(diff) <= tol) return <span className="pill ok"><i />Cuadra</span>;
  const a = isBs ? bs(Math.abs(diff)) : usd(Math.abs(diff));
  return diff > 0 ? <span className="pill soon"><i />Sobran {a}</span> : <span className="pill late"><i />Faltan {a}</span>;
}

export function Cuadre() {
  const [turno, setTurno] = useState<TurnoResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [step, setStep] = useState(1);
  const [fUsd, setFUsd] = useState("20");
  const [fBs, setFBs] = useState("0");
  const [cnt, setCnt] = useState<Record<number, number>>({ 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 });
  const [cBs, setCBs] = useState("");
  const [verif, setVerif] = useState<Record<string, string>>({}); // lo que reporta cada método digital
  const [cerrado, setCerrado] = useState<TurnoResumen | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const id = getTurnoId();
    if (id) resumenTurno(id).then((t) => { setTurno(t); setCargando(false); }).catch(() => { setTurnoId(null); setCargando(false); });
    else setCargando(false);
  }, []);

  const abrir = async () => {
    try {
      const t = await abrirTurno(numOf(fUsd), numOf(fBs));
      setTurnoId(t.turnoId); setTurno(t); setStep(1);
    } catch (e) { setErr((e as Error).message); }
  };

  const refrescar = async () => { if (turno) setTurno(await resumenTurno(turno.turnoId)); };

  const cntUsd = r2(DEN.reduce((s, d) => s + d * cnt[d], 0));
  const paso = (d: number, inc: number) => setCnt({ ...cnt, [d]: Math.max(0, cnt[d] + inc) });

  const cerrar = async () => {
    if (!turno) return;
    try {
      const r = await cerrarTurno(turno.turnoId, cntUsd, numOf(cBs));
      setTurnoId(null); setCerrado(r);
    } catch (e) { setErr((e as Error).message); }
  };

  const nuevo = () => { setCerrado(null); setTurno(null); setStep(1); setCnt({ 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 2: 0, 1: 0 }); setCBs(""); };

  if (cargando) return <div className="stub">Cargando…</div>;

  // Caja cerrada ya (resultado)
  if (cerrado) {
    return (
      <div className="czwrap">
        <div className="card czhero"><span className="ibox" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}><UIcono k="check" sw={2.4} /></span><div><b>Caja cerrada</b><span>Turno #{cerrado.turnoId}</span></div></div>
        <div className="card czres"><div className="cardhead"><h3 className="h3">Dólares</h3>{pill(cerrado.diferenciaUsd ?? 0, false)}</div>
          <div className="cmp"><div><span>Contaste</span><b className="t">{usd(cerrado.declaradoUsd ?? 0)}</b></div><div><span>Debía haber</span><b className="t">{usd(cerrado.esperadoUsd)}</b></div></div></div>
        <div className="card czres"><div className="cardhead"><h3 className="h3">Bolívares</h3>{pill(cerrado.diferenciaBs ?? 0, true)}</div>
          <div className="cmp"><div><span>Contaste</span><b className="t">{bs(cerrado.declaradoBs ?? 0)}</b></div><div><span>Debía haber</span><b className="t">{bs(cerrado.esperadoBs)}</b></div></div></div>
        <button className="cta center press" onClick={nuevo}>Listo</button>
      </div>
    );
  }

  // Caja sin abrir
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

  const steps = ["Resumen", "Contar", "Revisar"];
  const stepsBar = (
    <div className="steps czsteps">
      {steps.map((n, i) => {
        const k = i + 1, cls = k < step ? "s done" : k === step ? "s now" : "s";
        return <span key={n} style={{ display: "contents" }}>{i > 0 && <span className="bar" />}<span className={cls}><i>{k < step ? <UIcono k="check" sw={3} /> : k}</i><span className="nm">{n}</span></span></span>;
      })}
    </div>
  );

  return (
    <div className="czwrap">
      {stepsBar}
      {step === 1 && (
        <>
          <div className="card czday"><span className="k">Cobrado en efectivo</span><b className="t">{usd(turno.efectivoUsd)}</b><span className="muted t">+ {bs(turno.efectivoBs)} en bolívares</span></div>
          <div className="card"><div className="cardhead"><h3 className="h3">Debería haber en la gaveta</h3></div>
            <div className="cmp czres"><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "10px 12px" }}><span style={{ fontSize: 12.5, color: "var(--text-2)" }}>Dólares</span><b className="t" style={{ fontSize: 20, display: "block", fontWeight: 600 }}>{usd(turno.esperadoUsd)}</b></div>
              <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "10px 12px" }}><span style={{ fontSize: 12.5, color: "var(--text-2)" }}>Bolívares</span><b className="t" style={{ fontSize: 20, display: "block", fontWeight: 600 }}>{bs(turno.esperadoBs)}</b></div>
            </div></div>
            <div className="hint" style={{ marginTop: 8 }}>Fondo {usd(turno.fondoUsd)} + efectivo − vuelto. Cuenta sin mirar esto; luego te decimos si cuadra.</div>
          </div>
          <button className="cta center press" onClick={() => { refrescar(); setStep(2); }}>Empezar a contar</button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="card"><div className="cardhead"><h3 className="h3">Dólares en efectivo</h3><b className="t czsum">{usd(cntUsd)}</b></div>
            <div className="dens">{DEN.map((d) => (
              <div className="den" key={d}><span className="bn t">${d}</span>
                <div className="stp big"><button onClick={() => paso(d, -1)}>−</button><span className="t">{cnt[d]}</span><button onClick={() => paso(d, 1)}>+</button></div>
                <span className="t dsub">{cnt[d] ? usd(d * cnt[d]) : "—"}</span>
              </div>
            ))}</div>
          </div>
          <div className="card fld"><span className="h3">Bolívares en efectivo</span>
            <div className="inpw"><i>Bs</i><input className="inp t" style={{ paddingLeft: 40 }} value={cBs} onChange={(e) => setCBs(e.target.value)} placeholder="0" inputMode="decimal" /></div>
            <span className="hint">Cuenta todos los billetes en bolívares y escribe el total.</span>
          </div>
          <div className="two"><button className="btn2 press" onClick={() => setStep(1)}>Volver</button><button className="cta center press" onClick={() => setStep(3)}>Ver si cuadra</button></div>
        </>
      )}

      {step === 3 && (
        <>
          {turno.metodos.map((m) => {
            const isBs = m.moneda === "VES";
            const fmt = isBs ? bs : usd;
            const contaste = m.metodo === "EFECTIVO_USD" ? cntUsd
              : m.metodo === "EFECTIVO_BS" ? numOf(cBs)
              : numOf(verif[m.metodo] || "");
            const diff = r2(contaste - m.esperado);
            return (
              <div className="card czres" key={m.metodo}>
                <div className="cardhead"><h3 className="h3">{METODO_N[m.metodo] || m.metodo}</h3>{pill(diff, isBs)}</div>
                {m.digital && (
                  <div className="fld" style={{ marginTop: 6 }}>
                    <div className="inpw"><i>{isBs ? "Bs" : "$"}</i><input className="inp t" style={{ paddingLeft: 40 }} value={verif[m.metodo] || ""} onChange={(e) => setVerif({ ...verif, [m.metodo]: e.target.value })} placeholder="0" inputMode="decimal" aria-label={"Reporte de " + (METODO_N[m.metodo] || m.metodo)} /></div>
                    <span className="hint">Escribe lo que te reporta {METODO_N[m.metodo] || m.metodo}.</span>
                  </div>
                )}
                <div className="cmp"><div><span>{m.digital ? "Reportó" : "Contaste"}</span><b className="t">{fmt(contaste)}</b></div><div><span>Debería haber</span><b className="t">{fmt(m.esperado)}</b></div></div>
              </div>
            );
          })}
          {err && <p className="pinmsg err">{err}</p>}
          <div className="two"><button className="btn2 press" onClick={() => setStep(2)}>Volver a contar</button><button className="cta center press" onClick={cerrar}>Cerrar caja</button></div>
        </>
      )}
    </div>
  );
}
