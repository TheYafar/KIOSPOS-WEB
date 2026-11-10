import { useState } from "react";
import { createPortal } from "react-dom";
import type { Producto } from "../api";
import { leerMonto } from "../arqueo";

// Productos que se venden por peso o medida (kg, litro, metro): se pide cuánto lleva
// (o cuánto quiere gastar) y el sistema calcula el precio. Se usa al vender y al fiar.

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const UNIDADES: Record<string, { corto: string; largo: string; rapidos: number[] }> = {
  KG: { corto: "kg", largo: "kilos", rapidos: [0.25, 0.5, 1, 2] },
  G: { corto: "g", largo: "gramos", rapidos: [100, 250, 500, 1000] },
  L: { corto: "L", largo: "litros", rapidos: [0.5, 1, 2, 5] },
  M: { corto: "m", largo: "metros", rapidos: [0.5, 1, 2, 5] },
};
export const unidadDe = (p: Producto) => UNIDADES[(p.unidadMedida || "KG").toUpperCase()] || { corto: (p.unidadMedida || "").toLowerCase(), largo: p.unidadMedida, rapidos: [0.5, 1, 2] };
/** "0,75 kg" / "3" (por unidad no se muestra la unidad). */
export const cantTxt = (p: Producto, q: number) =>
  p.esPesable ? q.toLocaleString("es-VE", { maximumFractionDigits: 3 }) + " " + unidadDe(p).corto : String(q);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function CantidadPesable({ producto: p, tasa, inicial, onClose, onOk }: {
  producto: Producto; tasa: number; inicial?: number; onClose: () => void; onOk: (cantidad: number) => void;
}) {
  const u = unidadDe(p);
  const [modo, setModo] = useState<"cant" | "usd" | "bs">("cant");
  const [txt, setTxt] = useState(inicial ? String(inicial).replace(".", ",") : "");
  const v = leerMonto(txt) ?? 0;
  const cant = modo === "cant" ? r3(v) : p.precioUsd > 0 ? r3((modo === "usd" ? v : v / (tasa || 1)) / p.precioUsd) : 0;
  const precio = Math.round(cant * p.precioUsd * 100) / 100;
  const pasa = cant > p.stockActual;
  const ok = cant > 0 && !pasa;
  const confirmar = () => { if (ok) onOk(cant); };
  // Portal: se abre encima de todo aunque se llame desde otra ventana (perfil del cliente).
  return createPortal(
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card pes-card" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); confirmar(); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
        <div className="modal-head"><h2>{p.nombre}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">Se vende por {u.largo}: $ {money(p.precioUsd)} el {u.corto} · hay {cantTxt(p, p.stockActual)}</span>
          <div className="seg cfg-seg" role="tablist" aria-label="Cómo indicar la cantidad">
            <button className={modo === "cant" ? "on" : ""} onClick={() => { setModo("cant"); setTxt(""); }}>En {u.largo}</button>
            <button className={modo === "usd" ? "on" : ""} onClick={() => { setModo("usd"); setTxt(""); }}>Por monto $</button>
            <button className={modo === "bs" ? "on" : ""} onClick={() => { setModo("bs"); setTxt(""); }}>Por monto Bs</button>
          </div>
          <div className="inpw pes-in"><i>{modo === "cant" ? u.corto : modo === "usd" ? "$" : "Bs"}</i>
            <input autoFocus className="inp t" inputMode="decimal" placeholder="0" value={txt} onChange={(e) => setTxt(e.target.value.replace(/[^\d.,]/g, ""))}
              aria-label={modo === "cant" ? "Cantidad en " + u.largo : "Monto a llevar"} /></div>
          {modo === "cant" && (
            <div className="chips">{u.rapidos.map((x) => <button key={x} className={"chip press" + (cant === x ? " on" : "")} onClick={() => setTxt(String(x).replace(".", ","))}>{String(x).replace(".", ",")} {u.corto}</button>)}</div>
          )}
          <div className={"pes-res" + (pasa ? " bad" : "")}>
            <span>{modo === "cant" ? "Vale" : "Lleva"}</span>
            <b className="t">{modo === "cant" ? "$ " + money(precio) : cantTxt(p, cant)}</b>
            <small className="t">{modo === "cant" ? "Bs " + money(Math.round(precio * tasa * 100) / 100) : "$ " + money(precio)}{pasa ? " · no hay tanto en inventario" : ""}</small>
          </div>
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!ok} onClick={confirmar}>Agregar {cant > 0 ? cantTxt(p, cant) : ""} <kbd className="kb">Enter</kbd></button></div>
      </div>
    </div>,
    document.body,
  );
}
