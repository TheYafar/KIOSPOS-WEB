import { useEffect, useState } from "react";
import { cambiarMiPlan, miSuscripcion, misPagos, reportarPago, type MiPago, type Situacion } from "../api";
import { ElegirPlan } from "./ElegirPlan";
import { getSesion } from "../session";

const usd = (n: number | string) => "$ " + Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pillCls: Record<string, string> = { ACTIVA: "ok", AVISO: "warn", SUSPENDIDA: "bad" };
const ESTADO_N: Record<string, string> = { PENDIENTE: "En revisión", APROBADO: "Aprobado", RECHAZADO: "Rechazado" };
const numOf = (s: string) => parseFloat(String(s || "").replace(/\./g, "").replace(",", ".")) || 0;

/** Lo que el dueño ve de SU mensualidad: estado, hasta cuándo pagó, y reportar un pago. */
export function MiPlan() {
  const [sit, setSit] = useState<Situacion | null>(null);
  const [pagos, setPagos] = useState<MiPago[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(false);
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("Pago móvil");
  const [referencia, setReferencia] = useState("");
  const [meses, setMeses] = useState("1");
  const [cambiando, setCambiando] = useState<{ plan: string; cajas: number } | null>(null);
  const esDueno = getSesion()?.rol === "DUENO";

  const cargar = () => {
    miSuscripcion().then(setSit).catch((e) => setErr((e as Error).message));
    misPagos().then(setPagos).catch(() => {});
  };
  useEffect(cargar, []);

  const guardarPlan = async () => {
    if (!cambiando) return;
    try {
      const s = await cambiarMiPlan(cambiando.plan, cambiando.cajas);
      setSit(s); setCambiando(null); setErr(""); setMsg("Plan actualizado. La nueva mensualidad aplica desde tu próximo pago.");
    } catch (e) { setErr((e as Error).message); }
  };

  const enviar = async () => {
    const m = numOf(monto);
    if (m <= 0 || !metodo.trim()) return;
    try {
      await reportarPago({ monto: m, moneda: "USD", metodo: metodo.trim(), referencia: referencia.trim() || undefined, meses: Number(meses) || 1 });
      setMsg("Pago reportado. Queda en revisión hasta que lo aprueben.");
      setForm(false); setMonto(""); setReferencia("");
      cargar();
    } catch (e) { setErr((e as Error).message); }
  };

  if (err && !sit) return <div className="plan-err">{err}</div>;
  if (!sit) return <div className="cb-loading">Cargando tu plan…</div>;
  const est = sit.estadoEfectivo;

  return (
    <section className="plan">
      <div className="plan-head">
        <div>
          <span className="plan-k">Tu plan</span>
          <b className="plan-name">Plan {sit.planNombre || sit.plan || "—"}</b>
          {sit.mensualidad != null && <span className="plan-sub t">{usd(sit.mensualidad)}/mes · {sit.cajasContratadas ?? 1} {(sit.cajasContratadas ?? 1) === 1 ? "caja" : "cajas"}</span>}
        </div>
        <span className={"cb-pill " + (sit.enPrueba && est === "ACTIVA" ? "warn" : pillCls[est] || "warn")}><i />{sit.enPrueba && est === "ACTIVA" ? "PRUEBA GRATIS" : est}</span>
      </div>
      {esDueno && !cambiando && <button className="cb-btn ghost plan-cambiar" onClick={() => { setMsg(""); setCambiando({ plan: sit.plan || "BASICO", cajas: sit.cajasContratadas ?? 1 }); }}>Cambiar plan o cajas</button>}
      {cambiando && (
        <div className="plan-form">
          <b>Elige tu plan</b>
          <ElegirPlan plan={cambiando.plan} cajas={cambiando.cajas} onChange={(plan, cajas) => setCambiando({ plan, cajas })} />
          {err && <p className="pinmsg err">{err}</p>}
          <div className="cb-formacts">
            <button className="cb-btn ghost" onClick={() => { setCambiando(null); setErr(""); }}>Cancelar</button>
            <button className="cb-btn save" onClick={guardarPlan}>Guardar plan</button>
          </div>
        </div>
      )}

      <div className="plan-grid">
        <div className="plan-box"><span className="k">{sit.enPrueba ? "Prueba gratis hasta" : "Pagaste hasta"}</span><b className="t">{sit.pagoHasta || "—"}</b></div>
        {sit.mesesPendientes > 0
          ? <div className="plan-box bad"><span className="k">Debes</span><b className="t">{usd(sit.deuda)}</b><span className="d">{sit.mesesPendientes} mes(es)</span></div>
          : <div className="plan-box ok"><span className="k">Al día</span><b className="t">✓</b><span className="d">sin deuda</span></div>}
      </div>
      {sit.mensaje && <p className="plan-msg">{sit.mensaje}</p>}

      {msg && <div className="plan-ok">{msg}</div>}

      {!form && <button className="cb-btn save" style={{ width: "100%" }} onClick={() => { setMsg(""); setForm(true); if (!monto && sit.mensualidad) setMonto(String(sit.mensualidad).replace(".", ",")); }}>Reportar un pago</button>}
      {form && (
        <div className="plan-form">
          <b>Reportar un pago</b>
          <div className="cb-two">
            <div className="cb-fld"><label>Monto</label><div className="cb-inpw"><i>$</i><input className="cb-inp t" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0,00" /></div></div>
            <div className="cb-fld"><label>Meses</label><input className="cb-inp t" inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value.replace(/\D/g, "").slice(0, 2) || "")} /></div>
          </div>
          <div className="cb-fld"><label>Método</label>
            <select className="cb-inp" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              <option>Pago móvil</option><option>Transferencia</option><option>Zelle</option><option>Binance / USDT</option><option>Efectivo</option>
            </select>
          </div>
          <div className="cb-fld"><label>Referencia <span className="opt">(opcional)</span></label><input className="cb-inp" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° de referencia" /></div>
          <div className="cb-formacts">
            <button className="cb-btn ghost" onClick={() => setForm(false)}>Cancelar</button>
            <button className="cb-btn save" onClick={enviar}>Enviar</button>
          </div>
        </div>
      )}

      {pagos.length > 0 && (
        <div className="plan-pagos">
          <span className="plan-k">Tus pagos reportados</span>
          {pagos.map((p) => (
            <div className="plan-pago" key={p.id}>
              <div><b>{usd(p.monto)}</b><span className="d">{p.metodo}{p.referencia ? " · " + p.referencia : ""} · {p.meses} mes(es)</span></div>
              <span className={"cb-pill " + (p.estado === "APROBADO" ? "ok" : p.estado === "RECHAZADO" ? "bad" : "warn")}><i />{ESTADO_N[p.estado] || p.estado}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
