import { useEffect, useState } from "react";
import { buscarVenta, detalleVenta, type ClienteFiado, type VentaDetalle, type VentaFila } from "../api";
import { UIcono } from "../icons";

// Factura: con solo el NÚMERO, el dueño o el encargado ven qué se llevó la persona,
// cuándo, cuánto y a nombre de quién quedó el crédito. Pensado para el crédito de los
// trabajadores: se vende normal en la caja (Crédito → el empleado) y luego basta el número.

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const cantidad = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-VE", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const NOMBRE: Record<string, string> = { EFECTIVO_USD: "Efectivo $", EFECTIVO_BS: "Efectivo Bs", PAGO_MOVIL: "Pago móvil", PUNTO: "Punto", BIOPAGO: "Biopago", OTRO: "Otra", FIADO: "Crédito" };
export const numFactura = (n: number) => String(n).padStart(4, "0");

/** Busca una factura por su número y muestra su detalle. */
export function BuscarFactura({ clientes, onClose }: { clientes: ClienteFiado[]; onClose: () => void }) {
  const [num, setNum] = useState("");
  const [res, setRes] = useState<VentaFila[] | null>(null);
  const [ver, setVer] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [buscando, setBuscando] = useState(false);
  const buscar = async () => {
    const n = Number(num.replace(/\D/g, ""));
    if (!n) return;
    setErr(""); setBuscando(true);
    try {
      const l = await buscarVenta(n);
      setRes(l);
      if (l.length === 1) setVer(l[0].id); // una sola: directo al detalle
    } catch (e) { setErr((e as Error).message); } finally { setBuscando(false); }
  };
  if (ver != null) return <DetalleFactura ventaId={ver} clientes={clientes} onClose={() => (res && res.length > 1 ? setVer(null) : onClose())} />;
  const nombreDe = (id: number | null) => clientes.find((c) => c.id === id)?.nombre;
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Buscar factura</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">Escribe el número de la factura (sale en el ticket y en la pantalla al cobrar).</span>
          <form className="fac-busca" onSubmit={(e) => { e.preventDefault(); buscar(); }}>
            <label className="search"><span className="t3">N°</span>
              <input autoFocus inputMode="numeric" className="t" value={num} onChange={(e) => { setNum(e.target.value.replace(/\D/g, "")); setRes(null); }}
                placeholder="Ej. 42" aria-label="Número de factura" />
            </label>
            <button className="btn primary press" disabled={!num || buscando}><UIcono k="search" sw={2} />{buscando ? "Buscando…" : "Buscar"}</button>
          </form>
          {err && <p className="pinmsg err">{err}</p>}
          {res && res.length === 0 && <p className="noresult">No hay ninguna factura con el número {num}.</p>}
          {res && res.length > 1 && (
            <>
              <span className="hint">Hay {res.length} facturas con ese número (una por caja). Elige la tuya:</span>
              <div className="cli-pick">
                {res.map((v) => (
                  <button key={v.id} className="cli-pick-row press" onClick={() => setVer(v.id)}>
                    <b>Caja {v.cajaId ?? "sin caja"} · {fechaHora(v.fechaHora)}</b>
                    <small>{nombreDe(v.clienteId) ? "Crédito de " + nombreDe(v.clienteId) : v.pagos}</small>
                    <span className="t">{usd(v.totalUsd)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Detalle de una factura: productos, fecha, total, cómo se pagó y a quién se le dio crédito. */
export function DetalleFactura({ ventaId, clientes, onClose }: { ventaId: number; clientes: ClienteFiado[]; onClose: () => void }) {
  const [v, setV] = useState<VentaDetalle | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { detalleVenta(ventaId).then(setV).catch((e) => setErr((e as Error).message)); }, [ventaId]);
  const cliente = v?.clienteId != null ? clientes.find((c) => c.id === v.clienteId) : undefined;
  const credito = v ? v.pagos.filter((p) => p.metodo === "FIADO").reduce((s, p) => s + p.monto, 0) : 0;
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>{v ? "Factura N° " + numFactura(v.numeroFactura) : "Factura"}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body" aria-label="Detalle de la factura">
          {err && <p className="pinmsg err">{err}</p>}
          {!v && !err && <p className="hint">Cargando…</p>}
          {v && (
            <>
              <div className="fac-cab">
                <div><span className="k">Fecha</span><b>{fechaHora(v.fechaHora)}</b></div>
                <div><span className="k">Caja</span><b>{v.cajaId ? "Caja " + v.cajaId : "Sin caja (dueño)"}</b></div>
                {cliente && <div><span className="k">{cliente.tipo === "TRABAJADOR" ? "Crédito del empleado" : "Crédito de"}</span><b>{cliente.nombre}</b></div>}
                {v.estado === "ANULADA" && <div><span className="pill bad">Anulada</span>{v.motivoAnulacion && <small> {v.motivoAnulacion}</small>}</div>}
              </div>
              <div className="vt-lineas">
                {v.lineas.map((l) => (
                  <div className="fac-ln" key={l.detalleId}>
                    <span className="t fac-cant">{cantidad(l.cantidad)} ×</span>
                    <span className="fac-nm">{l.nombre}{l.devuelto > 0 && <small className="mg-bad"> · devuelto {cantidad(l.devuelto)}</small>}</span>
                    <b className="t">{usd(l.subtotalUsd)}</b>
                  </div>
                ))}
              </div>
              <div className="fac-tot">
                <div><span>Total</span><b className="t">{usd(v.totalUsd)}</b></div>
                {credito > 0 && <div className="mg-bad"><span>A crédito</span><b className="t">{usd(credito)}</b></div>}
                {v.devueltoUsd > 0 && <div><span>Devuelto</span><b className="t">− {usd(v.devueltoUsd)}</b></div>}
                <small className="t3">{v.pagos.map((p) => (NOMBRE[p.metodo] || p.metodo) + " " + (p.moneda === "USD" ? usd(p.monto) : "Bs " + money(p.monto))).join(" · ")}</small>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
