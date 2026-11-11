import { useEffect, useState } from "react";
import type { Presentacion, Producto } from "../api";
import { UIcono } from "../icons";

// Productos por bloques: una caja de cigarros trae 20, la media trae 10 y también se
// venden sueltos. En el ticket cada bloque es una línea propia con su precio; por dentro
// es un "producto virtual" (id negativo = −id del bloque) que al cobrar se manda como
// { productoId: el producto, presentacionId: el bloque }. El servidor baja el stock en
// unidades (cantidad × lo que trae).

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
export const cantBloque = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
const UNIDAD: Record<string, string> = { KG: "kg", G: "g", L: "L", M: "m" };

/** Nombre que se lee en el ticket: "Cigarros Belmont (Caja x20)". */
export const nombreBloque = (p: Producto, b: Presentacion) => `${p.nombre} (${b.nombre} x${cantBloque(b.cantidad)}${p.esPesable ? " " + (UNIDAD[p.unidadMedida] || "") : ""})`.replace(" )", ")");

/** El bloque como si fuera un producto, para el ticket de la caja. */
export function comoProducto(p: Producto, b: Presentacion): Producto {
  return {
    ...p, id: -b.id, nombre: nombreBloque(p, b), precioUsd: b.precioUsd, codigoBarras: b.codigoBarras || "",
    esPesable: false, stockActual: Math.floor(p.stockActual / b.cantidad + 1e-9),
  };
}

/** Cuánto sale cada unidad dentro del bloque y cuánto se ahorra frente a comprar sueltos. */
export function ahorro(p: Producto, b: Presentacion): number {
  return Math.round((p.precioUsd * b.cantidad - b.precioUsd) * 100) / 100;
}

/** Ventana para elegir cómo se lleva el producto: suelto o en uno de sus bloques. Teclas 1..9. */
export function ElegirBloque({ producto: p, bloques, onElegir, onClose }: {
  producto: Producto; bloques: Presentacion[]; onElegir: (b: Presentacion | null) => void; onClose: () => void;
}) {
  const opciones: (Presentacion | null)[] = [null, ...bloques];
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= opciones.length) { e.preventDefault(); e.stopPropagation(); elegir(opciones[n - 1]); }
      else if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); setSel((s) => Math.min(s + 1, opciones.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); elegir(opciones[sel]); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  });
  const hay = (b: Presentacion | null) => (b ? p.stockActual >= b.cantidad - 1e-9 : p.stockActual > 0);
  const elegir = (b: Presentacion | null) => { if (hay(b)) onElegir(b); };
  const u = p.esPesable ? UNIDAD[p.unidadMedida] || "" : "";
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>{p.nombre}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">¿Cómo se lo lleva? Hay {cantBloque(p.stockActual)}{u ? " " + u : ""} en existencia.</span>
          <div className="blq-ops" role="listbox" aria-label="Cómo se vende">
            {opciones.map((b, i) => {
              const ok = hay(b);
              const ah = b ? ahorro(p, b) : 0;
              return (
                <button key={b ? b.id : "u"} role="option" aria-selected={i === sel} disabled={!ok}
                  className={"blq-op press" + (i === sel ? " sel" : "")} onClick={() => elegir(b)}>
                  <kbd className="kb">{i + 1}</kbd>
                  <span className="blq-nm"><b>{b ? b.nombre : p.esPesable ? "Por " + (u || "medida") : "Unidad (suelto)"}</b>
                    <small>{b ? "Trae " + cantBloque(b.cantidad) + (u ? " " + u : "") + (ah > 0 ? " · ahorra " + usd(ah) : "") : ok ? "Precio normal" : "Sin existencia"}
                      {b && !ok && " · no alcanza la existencia"}</small></span>
                  <b className="t">{usd(b ? b.precioUsd : p.precioUsd)}</b>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Editor de bloques de un producto (dueño/encargado): nombre, cuántas trae, precio y código opcional. */
export interface FilaBloque { nombre: string; cantidad: string; precio: string; codigo: string; }
export function EditorBloques({ filas, setFilas, producto }: { filas: FilaBloque[]; setFilas: (f: FilaBloque[]) => void; producto: { precioUsd: number; esPesable: boolean; unidadMedida: string } }) {
  const u = producto.esPesable ? UNIDAD[producto.unidadMedida] || "" : "unidades";
  const cambiar = (i: number, k: keyof FilaBloque, v: string) => setFilas(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const sugerencias = producto.esPesable ? [["Saco", "25"], ["Medio saco", "12.5"]] : [["Caja", "20"], ["Media caja", "10"], ["Bulto", "24"], ["Paquete", "6"]];
  const agregar = (nombre = "", cantidad = "") => setFilas([...filas, { nombre, cantidad, precio: "", codigo: "" }]);
  return (
    <div className="blq-ed">
      <div className="blq-ed-head"><b>Se vende también por bloques</b><small>Ej.: una caja trae 20 y la media caja 10. Suelto se vende al precio normal.</small></div>
      {filas.map((f, i) => {
        const cant = Number(f.cantidad.replace(",", ".")) || 0;
        const precio = Number(f.precio.replace(",", ".")) || 0;
        const suelto = Math.round(producto.precioUsd * cant * 100) / 100;
        return (
          <div className="blq-fila" key={i}>
            <input className="inp" value={f.nombre} maxLength={60} placeholder="Nombre (Caja)" aria-label={"Nombre del bloque " + (i + 1)} onChange={(e) => cambiar(i, "nombre", e.target.value)} />
            <div className="inpw"><input className="inp t" inputMode="decimal" value={f.cantidad} placeholder="Trae" aria-label={"Cuántas trae el bloque " + (i + 1)}
              onChange={(e) => cambiar(i, "cantidad", e.target.value.replace(/[^\d.,]/g, ""))} /><i className="suf">{u}</i></div>
            <div className="inpw"><i>$</i><input className="inp t pre" inputMode="decimal" value={f.precio} placeholder={suelto > 0 ? money(suelto) : "Precio"} aria-label={"Precio del bloque " + (i + 1)}
              onChange={(e) => cambiar(i, "precio", e.target.value.replace(/[^\d.,]/g, ""))} /></div>
            <input className="inp" value={f.codigo} placeholder="Código (opcional)" aria-label={"Código de barras del bloque " + (i + 1)} onChange={(e) => cambiar(i, "codigo", e.target.value)} />
            <button className="ghost press blq-x" aria-label={"Quitar bloque " + (i + 1)} onClick={() => setFilas(filas.filter((_, j) => j !== i))}><UIcono k="close" sw={2} /></button>
            {cant > 0 && precio > 0 && suelto > 0 && <small className="blq-nota t">{precio < suelto ? "Ahorra " + usd(suelto - precio) + " frente a " + cantBloque(cant) + " sueltos" : precio > suelto ? "Ojo: sale más caro que " + cantBloque(cant) + " sueltos (" + usd(suelto) + ")" : "Igual que sueltos"}</small>}
          </div>
        );
      })}
      <div className="blq-sug">
        {sugerencias.filter(([n]) => !filas.some((f) => f.nombre.trim().toLowerCase() === n.toLowerCase())).map(([n, c]) => (
          <button key={n} className="chip press" onClick={() => agregar(n, c)}>+ {n}{producto.esPesable ? "" : " (" + c + ")"}</button>
        ))}
        <button className="chip press" onClick={() => agregar()}>+ Otro bloque</button>
      </div>
    </div>
  );
}

/** Convierte las filas del editor en datos para el servidor (o un mensaje de error). */
export function leerBloques(filas: FilaBloque[]): { ok: true; lista: { nombre: string; cantidad: number; precioUsd: number; codigoBarras: string | null }[] } | { ok: false; error: string } {
  const lista = [];
  for (const f of filas) {
    if (!f.nombre.trim() && !f.cantidad && !f.precio) continue; // fila vacía
    const cantidad = Number(f.cantidad.replace(",", "."));
    const precioUsd = Number(f.precio.replace(",", "."));
    if (!f.nombre.trim()) return { ok: false, error: "Ponle nombre a cada bloque (Ej.: Caja)" };
    if (!(cantidad > 0)) return { ok: false, error: `"${f.nombre.trim()}": escribe cuántas trae` };
    if (!(precioUsd > 0)) return { ok: false, error: `"${f.nombre.trim()}": escribe el precio` };
    lista.push({ nombre: f.nombre.trim(), cantidad, precioUsd, codigoBarras: f.codigo.trim() || null });
  }
  return { ok: true, lista };
}

export const filasDe = (bs: Presentacion[]): FilaBloque[] =>
  bs.map((b) => ({ nombre: b.nombre, cantidad: String(b.cantidad).replace(".", ","), precio: String(b.precioUsd).replace(".", ","), codigo: b.codigoBarras || "" }));
