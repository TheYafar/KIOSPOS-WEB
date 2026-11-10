import { useEffect, useState } from "react";
import { listarCajas, listarProductos, listarUsuarios } from "../api";

type Estado = { cajas: number; cajeros: number; productos: number } | null;

/**
 * Guía de alta: una tarjeta que aparece solo mientras al negocio le falta algo para
 * vender (0 cajas / 0 cajeros / 0 productos) y lleva al dueño paso a paso. Se oculta
 * sola cuando todo está listo. `onIr` cambia de pestaña en el Shell.
 */
export function PrimerosPasos({ onIr }: { onIr: (tab: string) => void }) {
  const [e, setE] = useState<Estado>(null);

  useEffect(() => {
    Promise.all([
      listarCajas().catch(() => []),
      listarUsuarios().catch(() => []),
      listarProductos().catch(() => [])
    ]).then(([cajas, usuarios, productos]) => {
      setE({
        cajas: cajas.length,
        cajeros: usuarios.filter((u) => u.rol === "CAJERO").length,
        productos: productos.length
      });
    });
  }, []);

  if (!e) return null;
  const pasos = [
    { ok: e.cajas > 0, n: "Crea tu primera caja", d: "El equipo donde se cobra. Al crearla te da un enlace para configurarlo.", cta: "Ir a Equipo y cajas", tab: "mas" },
    { ok: e.cajeros > 0, n: "Agrega un cajero", d: "Con su PIN de 4 dígitos para cobrar rápido.", cta: "Ir a Equipo y cajas", tab: "mas" },
    { ok: e.productos > 0, n: "Carga tu inventario", d: "Producto por producto o importando un CSV.", cta: "Ir a Productos", tab: "inventario" }
  ];
  const faltan = pasos.filter((p) => !p.ok).length;
  if (faltan === 0) return null;
  const hechos = pasos.length - faltan;

  return (
    <section className="pp pasos">
      <div className="pp-head">
        <div>
          <b>Primeros pasos</b>
          <span>Deja tu negocio listo para vender — {hechos} de {pasos.length} hecho{hechos === 1 ? "" : "s"}.</span>
        </div>
        <div className="pp-prog"><i style={{ width: Math.round((hechos / pasos.length) * 100) + "%" }} /></div>
      </div>
      <div className="pp-list">
        {pasos.map((p, i) => (
          <div className={"pp-item" + (p.ok ? " done" : "")} key={i}>
            <span className="pp-mark">
              {p.ok
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
                : <b>{i + 1}</b>}
            </span>
            <div className="pp-txt"><b>{p.n}</b><span>{p.d}</span></div>
            {!p.ok && <button className="pp-cta" onClick={() => onIr(p.tab)}>{p.cta}</button>}
          </div>
        ))}
      </div>
    </section>
  );
}
