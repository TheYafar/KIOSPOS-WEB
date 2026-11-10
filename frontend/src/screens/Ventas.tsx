import { useEffect, useState } from "react";
import { anularVenta, detalleVenta, devolverVenta, ventasDelDia, type VentaDetalle, type VentaFila } from "../api";
import { getSesion } from "../session";
import { UIcono } from "../icons";
import { leerMonto } from "../arqueo";

// Ventas del día: ver cada venta y, si hace falta, ANULARLA (error al cobrar, mientras su
// turno siga abierto) o DEVOLVER productos (parcial o total, cualquier día).

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const NOMBRE: Record<string, string> = { EFECTIVO_USD: "Efectivo $", EFECTIVO_BS: "Efectivo Bs", PAGO_MOVIL: "Pago móvil", PUNTO: "Punto", BIOPAGO: "Biopago", OTRO: "Otra", FIADO: "Fiado" };
const esJefe = () => { const r = getSesion()?.rol; return r === "DUENO" || r === "ENCARGADO"; };

export function Ventas() {
  const [fecha, setFecha] = useState(hoy());
  const [lista, setLista] = useState<VentaFila[]>([]);
  const [err, setErr] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const cargar = () => { setCargando(true); ventasDelDia(fecha).then((l) => { setLista(l); setErr(""); }).catch((e) => setErr((e as Error).message)).finally(() => setCargando(false)); };
  useEffect(() => { cargar(); }, [fecha]);

  const vivas = lista.filter((v) => v.estado === "COMPLETADA");
  const total = vivas.reduce((s, v) => s + v.totalUsd - v.devueltoUsd, 0);
  const anuladas = lista.length - vivas.length;

  return (
    <div className="caja">
      <div className="scroll pad cli">
        <div className="cli-head">
          <div><h2>Ventas</h2><p>Toca una venta para verla, anularla o devolver productos.</p></div>
          <label className="vt-fecha"><span>Día</span><input className="inp" type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value || hoy())} aria-label="Día de las ventas" /></label>
        </div>
        <div className="inv-stats">
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="cart" /></span>
            <div><span className="k">Vendido (neto)</span><span className="v t">{usd(total)}</span><span className="d">{vivas.length} venta(s)</span></div></div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}><UIcono k="close" /></span>
            <div><span className="k">Anuladas · devoluciones</span><span className="v t">{anuladas}</span><span className="d">{usd(lista.filter((v) => v.devueltoUsd > 0).reduce((s, v) => s + v.devueltoUsd, 0))} devuelto</span></div></div>
        </div>
        {err && <p className="noresult">{err}</p>}
        <div className="vt-list">
          {lista.map((v) => (
            <button key={v.id} className={"card vt-row press" + (v.estado === "ANULADA" ? " anulada" : "")} onClick={() => setAbierta(v.id)}>
              <span className="vt-n t">#{v.numeroFactura}</span>
              <span className="vt-tx"><b>{new Date(v.fechaHora).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })} · {v.items} producto(s)</b>
                <small>{v.pagos.split(",").filter(Boolean).map((m) => NOMBRE[m] || m).join(" + ")}</small></span>
              <span className="vt-m">
                <b className="t">{usd(v.totalUsd)}</b>
                {v.estado === "ANULADA" ? <span className="pill late">Anulada</span> : v.devueltoUsd > 0 ? <span className="pill soon">Devuelto {usd(v.devueltoUsd)}</span> : <small className="t">{bs(v.totalBs)}</small>}
              </span>
            </button>
          ))}
        </div>
        {!cargando && lista.length === 0 && !err && <p className="noresult">No hay ventas ese día.</p>}
      </div>
      {abierta != null && <DetalleVentaModal id={abierta} onClose={() => setAbierta(null)} onCambio={cargar} />}
    </div>
  );
}

function DetalleVentaModal({ id, onClose, onCambio }: { id: number; onClose: () => void; onCambio: () => void }) {
  const [v, setV] = useState<VentaDetalle | null>(null);
  const [modo, setModo] = useState<"ver" | "anular" | "devolver">("ver");
  const [motivo, setMotivo] = useState("");
  const [cant, setCant] = useState<Record<number, string>>({});
  const [metodo, setMetodo] = useState("EFECTIVO_USD");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [enviando, setEnviando] = useState(false);
  const cargar = () => detalleVenta(id).then(setV).catch((e) => setErr((e as Error).message));
  useEffect(() => { cargar(); }, [id]);
  if (!v) return <div className="modal"><div className="modal-card"><div className="modal-body"><span className="hint">{err || "Cargando…"}</span></div></div></div>;

  const enCaja = getSesion()?.cajaId != null;
  const puedeAnular = v.estado === "COMPLETADA" && v.turnoAbierto && v.devoluciones.length === 0;
  const queda = (l: VentaDetalle["lineas"][number]) => Math.round((l.cantidad - l.devuelto) * 1000) / 1000;
  const puedeDevolver = v.estado === "COMPLETADA" && v.lineas.some((l) => queda(l) > 0);
  const totalDev = Math.round(v.lineas.reduce((s, l) => s + Math.min(queda(l), leerMonto(cant[l.detalleId]) ?? 0) * l.precioUsd, 0) * 100) / 100;
  const metodos = [
    ...(enCaja ? [["EFECTIVO_USD", "Efectivo $"], ["EFECTIVO_BS", "Efectivo Bs"]] : []),
    ...(v.clienteId ? [["A_CUENTA", "Bajar su fiado"]] : []),
    ...(esJefe() ? [["FUERA_DE_CAJA", "Fuera de caja"]] : []),
  ] as [string, string][];
  const reembolso = metodo === "EFECTIVO_BS" ? bs(Math.round(totalDev * v.tasa * 100) / 100) : usd(totalDev);

  const correr = async (fn: () => Promise<unknown>, msg: string) => {
    setEnviando(true); setErr("");
    try { await fn(); setOk(msg); setModo("ver"); setCant({}); setMotivo(""); await cargar(); onCambio(); window.dispatchEvent(new Event("kp-turno")); }
    catch (e) { setErr((e as Error).message); }
    finally { setEnviando(false); }
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card cli-det" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); if (modo !== "ver") setModo("ver"); else onClose(); } }}>
        <div className="modal-head"><h2>Venta #{v.numeroFactura}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div className="vt-res">
            <span>{new Date(v.fechaHora).toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · tasa Bs {money(v.tasa)}</span>
            <b className="t">{usd(v.totalUsd)} <small>{bs(v.totalBs)}</small></b>
            {v.estado === "ANULADA" && <span className="pill late">Anulada{v.motivoAnulacion ? ": " + v.motivoAnulacion : ""}</span>}
            {v.devueltoUsd > 0 && <span className="pill soon">Devuelto {usd(v.devueltoUsd)}</span>}
          </div>

          <div className="vt-lineas">
            {v.lineas.map((l) => (
              <div key={l.detalleId} className="vt-linea">
                <span className="vt-ln"><b>{l.nombre}</b><small className="t">{money(l.cantidad)} × {usd(l.precioUsd)}{l.devuelto > 0 ? " · devuelto " + money(l.devuelto) : ""}</small></span>
                {modo === "devolver" && queda(l) > 0 ? (
                  <span className="vt-dev">
                    <button className="press" aria-label={"Menos " + l.nombre} onClick={() => setCant({ ...cant, [l.detalleId]: String(Math.max(0, (leerMonto(cant[l.detalleId]) ?? 0) - 1)) })}>−</button>
                    <input className="inp t" inputMode="decimal" value={cant[l.detalleId] ?? ""} placeholder="0" aria-label={"Devolver de " + l.nombre}
                      onChange={(e) => setCant({ ...cant, [l.detalleId]: e.target.value.replace(/[^\d.,]/g, "") })} />
                    <button className="press" aria-label={"Más " + l.nombre} onClick={() => setCant({ ...cant, [l.detalleId]: String(Math.min(queda(l), (leerMonto(cant[l.detalleId]) ?? 0) + 1)) })}>+</button>
                    <button className="vt-todo press" onClick={() => setCant({ ...cant, [l.detalleId]: String(queda(l)) })}>Todo</button>
                  </span>
                ) : <b className="t">{usd(l.subtotalUsd)}</b>}
              </div>
            ))}
          </div>
          <span className="hint">Pagó con: {v.pagos.map((p) => (NOMBRE[p.metodo] || p.metodo) + " " + (p.moneda === "USD" ? usd(p.monto) : bs(p.monto))).join(" + ")}{v.vueltoUsd > 0 ? " · vuelto " + usd(v.vueltoUsd) : v.vueltoBs > 0 ? " · vuelto " + bs(v.vueltoBs) : ""}</span>

          {modo === "anular" && (
            <label className="lbl">¿Por qué se anula?
              <input className="inp" autoFocus value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: cobré dos veces, el cliente no se llevó nada" aria-label="Motivo de la anulación"
                onKeyDown={(e) => { if (e.key === "Enter" && motivo.trim()) correr(() => anularVenta(v.id, motivo.trim()), "Venta anulada ✓"); }} />
              <span className="hint">La mercancía vuelve al inventario y la venta sale del cierre de caja.</span>
            </label>
          )}
          {modo === "devolver" && (
            <>
              <div className="lbl">¿Cómo le devuelves?
                <div className="seg cli-met">{metodos.map(([m, n]) => <button key={m} className={metodo === m ? "on" : ""} onClick={() => setMetodo(m)}>{n}</button>)}</div>
              </div>
              {metodos.length === 0 && <span className="hint">Para devolver efectivo hazlo desde una caja abierta.</span>}
              <input className="inp" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional): vencido, dañado…" aria-label="Motivo de la devolución" />
              {totalDev > 0 && <div className="cli-saldo debe"><span>{metodo === "A_CUENTA" ? "Se baja de su fiado" : "Le devuelves"}</span><b className="t">{reembolso}</b><small>La mercancía vuelve al inventario.</small></div>}
            </>
          )}
          {err && <p className="pinmsg err">{err}</p>}
          {ok && <p className="pinmsg ok">{ok}</p>}
          {modo === "ver" && v.estado === "COMPLETADA" && !puedeAnular && <span className="hint">{v.devoluciones.length > 0
            ? "Ya tiene devoluciones (" + usd(v.devueltoUsd) + "): puedes devolver lo que queda."
            : "El turno de esta venta ya cerró: para corregirla usa “Devolver”."}</span>}
        </div>
        <div className="modal-foot two-btn">
          {modo === "ver" && <>
            {puedeAnular && <button className="btn danger big press" onClick={() => { setErr(""); setOk(""); setModo("anular"); }}>Anular venta</button>}
            {puedeDevolver && <button className="btn2 big press" onClick={() => { setErr(""); setOk(""); setMetodo(metodos[0]?.[0] || "EFECTIVO_USD"); setModo("devolver"); }}>Devolver productos</button>}
          </>}
          {modo === "anular" && <>
            <button className="btn2 big press" onClick={() => setModo("ver")}>Volver</button>
            <button className="btn danger big press" disabled={!motivo.trim() || enviando} onClick={() => correr(() => anularVenta(v.id, motivo.trim()), "Venta anulada ✓")}>{enviando ? "Anulando…" : "Confirmar anulación"}</button>
          </>}
          {modo === "devolver" && <>
            <button className="btn2 big press" onClick={() => setModo("ver")}>Volver</button>
            <button className="btn primary big press" disabled={totalDev <= 0 || enviando || metodos.length === 0} onClick={() => correr(() => devolverVenta(v.id, {
              items: v.lineas.map((l) => ({ detalleId: l.detalleId, cantidad: Math.min(queda(l), leerMonto(cant[l.detalleId]) ?? 0) })).filter((x) => x.cantidad > 0),
              metodoReembolso: metodo, ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
            }), "Devolución registrada ✓")}>{enviando ? "Guardando…" : "Devolver " + (totalDev > 0 ? reembolso : "")}</button>
          </>}
        </div>
      </div>
    </div>
  );
}
