import { useEffect, useMemo, useState } from "react";
import { cobrar, getTasa, listarProductos, type PagoCobro, type Producto } from "../api";

type Metodo = PagoCobro["metodo"];
interface Item { producto: Producto; qty: number; }

const METODOS: { id: Metodo; n: string; moneda: "USD" | "VES" }[] = [
  { id: "EFECTIVO_USD", n: "Efectivo $", moneda: "USD" },
  { id: "EFECTIVO_BS", n: "Efectivo Bs", moneda: "VES" },
  { id: "PUNTO", n: "Punto", moneda: "VES" },
  { id: "PAGO_MOVIL", n: "Pago móvil", moneda: "VES" },
  { id: "BIOPAGO", n: "Biopago", moneda: "VES" }
];

const usd = (n: number) => "$ " + n.toFixed(2);
const bs = (n: number) => "Bs " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Caja: catálogo + ticket + flujo de cobro. Conectada al backend con cola offline. */
export function Caja() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [q, setQ] = useState("");
  const [carrito, setCarrito] = useState<Map<number, Item>>(new Map());
  const [sheet, setSheet] = useState<"no" | "ticket" | "pago" | "listo">("no");
  const [metodo, setMetodo] = useState<Metodo>("EFECTIVO_USD");
  const [recibido, setRecibido] = useState("");
  const [vuelto, setVuelto] = useState(0);
  const [err, setErr] = useState("");

  const tasa = Number(getTasa()) || 1;

  useEffect(() => {
    listarProductos().then(setProductos).catch((e) => setErr((e as Error).message));
  }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return productos.filter((p) => !t || p.nombre.toLowerCase().includes(t) || p.codigoBarras.includes(t));
  }, [productos, q]);

  const totalUsd = useMemo(
    () => [...carrito.values()].reduce((s, i) => s + i.producto.precioUsd * i.qty, 0),
    [carrito]
  );
  const unidades = [...carrito.values()].reduce((s, i) => s + i.qty, 0);

  const agregar = (p: Producto) => {
    const m = new Map(carrito);
    const it = m.get(p.id);
    m.set(p.id, { producto: p, qty: (it?.qty ?? 0) + 1 });
    setCarrito(m);
  };
  const cambiar = (id: number, delta: number) => {
    const m = new Map(carrito);
    const it = m.get(id);
    if (!it) return;
    const q2 = it.qty + delta;
    if (q2 <= 0) m.delete(id);
    else m.set(id, { ...it, qty: q2 });
    setCarrito(m);
  };

  const confirmarPago = async () => {
    const monedaMetodo = METODOS.find((x) => x.id === metodo)!.moneda;
    const totalBs = totalUsd * tasa;
    let montoOriginal: number;
    let v = 0;
    if (metodo === "EFECTIVO_USD") {
      const r = Number(recibido) || totalUsd;
      montoOriginal = r;
      v = Math.max(0, r - totalUsd);
    } else {
      montoOriginal = Number(totalBs.toFixed(2));
    }
    try {
      const items = [...carrito.values()].map((i) => ({ productoId: i.producto.id, cantidad: i.qty }));
      const pagos: PagoCobro[] = [{ metodo, moneda: monedaMetodo, montoOriginal }];
      await cobrar(items, pagos);
      setVuelto(v);
      setSheet("listo");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const nuevaVenta = () => {
    setCarrito(new Map());
    setRecibido("");
    setVuelto(0);
    setErr("");
    setSheet("no");
  };

  return (
    <div className="caja">
      <div className="searchrow">
        <input className="inp" placeholder="Buscar producto o código…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="prods">
        {err && <p className="noresult">{err}</p>}
        {filtrados.map((p) => {
          const sinStock = p.stockActual <= 0;
          return (
            <button key={p.id} className={"prod" + (sinStock ? " out" : "")} onClick={() => agregar(p)} disabled={sinStock}>
              <span className="pn">{p.nombre}<em>{p.categoria} · stock {p.stockActual}</em></span>
              <span className="pp"><b>{usd(p.precioUsd)}</b></span>
            </button>
          );
        })}
        {filtrados.length === 0 && !err && <p className="noresult">Sin productos. Cárgalos en Inventario.</p>}
      </div>

      {unidades > 0 && (
        <div className="peek">
          <div style={{ flex: 1 }}>
            <b>{usd(totalUsd)}</b> <small>· {bs(totalUsd * tasa)} · {unidades} und</small>
          </div>
          <button className="btn" onClick={() => setSheet("ticket")}>Ver ticket</button>
        </div>
      )}

      {sheet !== "no" && (
        <div className="sheet-wrap" onClick={(e) => { if (e.target === e.currentTarget) setSheet("no"); }}>
          <div className="sheet">
            {sheet === "ticket" && (
              <>
                <h2>Ticket</h2>
                <div className="tk-lines">
                  {[...carrito.values()].map((i) => (
                    <div className="ln" key={i.producto.id}>
                      <span>{i.producto.nombre}</span>
                      <span className="stp">
                        <button onClick={() => cambiar(i.producto.id, -1)}>−</button>
                        <span>{i.qty}</span>
                        <button onClick={() => cambiar(i.producto.id, 1)}>+</button>
                      </span>
                      <b>{usd(i.producto.precioUsd * i.qty)}</b>
                    </div>
                  ))}
                </div>
                <div className="tk-foot">
                  <div className="tk-total"><span>Total</span><b>{usd(totalUsd)}</b></div>
                  <div className="tk-total"><span style={{ fontSize: 13, color: "var(--text-3)" }}>En bolívares</span><span>{bs(totalUsd * tasa)}</span></div>
                  <button className="btn" onClick={() => setSheet("pago")} disabled={unidades === 0}>Cobrar</button>
                </div>
              </>
            )}

            {sheet === "pago" && (
              <>
                <h2>Cobrar {usd(totalUsd)}</h2>
                <div className="pad">
                  <div className="mcards">
                    {METODOS.map((m) => (
                      <button key={m.id} className="mc" aria-pressed={metodo === m.id} onClick={() => setMetodo(m.id)}>
                        {m.n}<small>{m.moneda}</small>
                      </button>
                    ))}
                  </div>
                  {metodo === "EFECTIVO_USD" && (
                    <label style={{ fontSize: 13, color: "var(--text-2)" }}>
                      ¿Con cuánto paga? ($)
                      <input className="inp" inputMode="decimal" value={recibido}
                        onChange={(e) => setRecibido(e.target.value)} placeholder={totalUsd.toFixed(2)} />
                    </label>
                  )}
                  {err && <p className="pinmsg err">{err}</p>}
                  <button className="btn" onClick={confirmarPago}>Confirmar pago</button>
                </div>
              </>
            )}

            {sheet === "listo" && (
              <div className="center-stage">
                <div className="tick">✓</div>
                <h2>¡Cobrado!</h2>
                {vuelto > 0 && <div className="banner ok">Vuelto <b>{usd(vuelto)}</b></div>}
                <p style={{ color: "var(--text-3)", fontSize: 13 }}>
                  Guardado y enviado (o en cola si no hay internet).
                </p>
                <button className="btn" onClick={nuevaVenta}>Nueva venta</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
