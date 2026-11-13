import { useEffect, useRef, useState } from "react";
import { avisos, type Avisos } from "../api";
import { UIcono } from "../icons";

const usd = (n: number) => "$ " + Number(n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fecha = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "short" });
const UNI: Record<string, string> = { KG: "kg", G: "g", L: "L", M: "m", UND: "" };

function cuandoVence(v: string | null, dias: number | null, vencida: boolean): string {
  if (!v) return "sin fecha de pago";
  if (vencida) return "vencida (" + fecha(v) + ")";
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  if (dias != null && dias > 0) return "en " + dias + " días (" + fecha(v) + ")";
  return "vence " + fecha(v);
}

/** Campanita de avisos del dueño: pagos a proveedores pendientes y productos bajo stock. */
export function Campana({ onIr }: { onIr: (tab: string, sub?: "inv" | "compras") => void }) {
  const [a, setA] = useState<Avisos | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState<"todo" | "pagos" | "stock">("todo");
  const ref = useRef<HTMLDivElement>(null);

  const cargar = () => avisos().then(setA).catch(() => {});
  useEffect(() => {
    cargar();
    const t = window.setInterval(cargar, 180000);
    const refrescar = () => cargar();
    window.addEventListener("kp-avisos", refrescar);
    window.addEventListener("focus", refrescar);
    return () => { window.clearInterval(t); window.removeEventListener("kp-avisos", refrescar); window.removeEventListener("focus", refrescar); };
  }, []);
  useEffect(() => {
    if (!abierto) return;
    cargar();
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  const nPagos = a?.pagos.length ?? 0;
  const nStock = a?.stock.length ?? 0;
  const total = nPagos + nStock;
  const urgente = (a?.pagosVencidos ?? 0) + (a?.agotados ?? 0);
  const verPagos = filtro !== "stock";
  const verStock = filtro !== "pagos";
  const ir = (tab: string, sub?: "inv" | "compras") => { setAbierto(false); onIr(tab, sub); };

  return (
    <div className="cmp-bell-wrap" ref={ref}>
      <button className={"tema-btn press cmp-bell" + (total > 0 ? " hay" : "")} aria-label={"Avisos" + (total ? " (" + total + ")" : "")} title="Avisos"
        aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <UIcono k="campana" sw={1.9} />
        {total > 0 && <span className={"cmp-badge" + (urgente > 0 ? " urg" : "")}>{total > 99 ? "99+" : total}</span>}
      </button>
      {abierto && (
        <div className="avisos-pop" role="dialog" aria-label="Avisos">
          <div className="avisos-h"><b>Avisos</b><button className="ghost" onClick={() => setAbierto(false)}>Cerrar</button></div>
          <div className="seg avisos-seg" role="tablist">
            <button role="tab" aria-selected={filtro === "todo"} className={filtro === "todo" ? "on" : ""} onClick={() => setFiltro("todo")}>Todo{total ? " · " + total : ""}</button>
            <button role="tab" aria-selected={filtro === "pagos"} className={filtro === "pagos" ? "on" : ""} onClick={() => setFiltro("pagos")}>Pagos{nPagos ? " · " + nPagos : ""}</button>
            <button role="tab" aria-selected={filtro === "stock"} className={filtro === "stock" ? "on" : ""} onClick={() => setFiltro("stock")}>Stock{nStock ? " · " + nStock : ""}</button>
          </div>
          <div className="avisos-body">
            {!a && <p className="hint" style={{ padding: "16px 2px" }}>Cargando…</p>}
            {a && total === 0 && <div className="avisos-vacio"><UIcono k="check" sw={2.2} /><b>Todo en orden</b><span>No hay pagos pendientes ni productos bajo stock.</span></div>}
            {a && verPagos && nPagos > 0 && (
              <div className="avisos-grupo">
                <div className="avisos-gh"><UIcono k="cash" sw={1.9} /><b>Pagos a proveedores</b></div>
                {a.pagos.map((p) => (
                  <button key={p.compraId} className="aviso press" onClick={() => ir("inventario", "compras")}>
                    <span className={"aviso-dot" + (p.vencida ? " bad" : p.vence ? " warn" : "")} />
                    <span className="aviso-tx"><b>{p.proveedor || "Sin proveedor"}{p.numeroFactura ? " · " + p.numeroFactura : ""}</b>
                      <small className={p.vencida ? "mg-bad" : ""}>{cuandoVence(p.vence, p.diasPara, p.vencida)}</small></span>
                    <b className="t mg-bad">{usd(p.saldoUsd)}</b>
                  </button>
                ))}
              </div>
            )}
            {a && verStock && nStock > 0 && (
              <div className="avisos-grupo">
                <div className="avisos-gh"><UIcono k="box" sw={1.9} /><b>Inventario bajo</b></div>
                {a.stock.map((s) => (
                  <button key={s.productoId} className="aviso press" onClick={() => ir("inventario", "inv")}>
                    <span className={"aviso-dot" + (s.agotado ? " bad" : " warn")} />
                    <span className="aviso-tx"><b>{s.nombre}</b>
                      <small className={s.agotado ? "mg-bad" : ""}>{s.agotado ? "Agotado" : "Quedan " + (+s.stock).toLocaleString("es-VE") + (UNI[s.unidad] ? " " + UNI[s.unidad] : "") + " (mínimo " + (+s.minimo).toLocaleString("es-VE") + ")"}</small></span>
                    {s.agotado ? <span className="pill danger">Agotado</span> : <span className="pill warn">Bajo</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
