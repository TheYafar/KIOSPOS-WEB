import { useEffect, useMemo, useState } from "react";
import { anularCompra, compraPagada, detalleCompra, guardarProveedor, listarCompras, listarProductos, listarProveedores, registrarCompra,
  type CompraVista, type Producto, type ProveedorV } from "../api";
import { getTasa } from "../session";
import { UIcono } from "../icons";
import { leerMonto } from "../arqueo";

// Compras a proveedores: registrar la factura suma la mercancía al inventario y
// recalcula el costo promedio de cada producto. Se puede dejar "por pagar".

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
/** Igual que CompraService.costoPromedio del servidor. */
export const costoPromedio = (stock: number, costo: number, cant: number, nuevo: number) =>
  stock <= 0 || costo <= 0 ? Math.round(nuevo * 100) / 100 : Math.round(((stock * costo + cant * nuevo) / (stock + cant)) * 100) / 100;

export function Compras() {
  const [vista, setVista] = useState<"compras" | "proveedores">("compras");
  const [compras, setCompras] = useState<CompraVista[]>([]);
  const [provs, setProvs] = useState<ProveedorV[]>([]);
  const [nueva, setNueva] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [editProv, setEditProv] = useState<ProveedorV | null | "nuevo">(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const cargar = () => Promise.all([listarCompras(), listarProveedores()]).then(([c, p]) => { setCompras(c); setProvs(p); setErr(""); }).catch((e) => setErr((e as Error).message));
  useEffect(() => { cargar(); }, []);
  const porPagar = provs.reduce((s, p) => s + p.porPagarUsd, 0);
  const mes = hoy().slice(0, 7);
  const delMes = compras.filter((c) => c.compra.estado === "REGISTRADA" && c.compra.fecha.startsWith(mes)).reduce((s, c) => s + c.compra.totalUsd, 0);

  return (
    <div className="scroll pad cli">
      <div className="cli-head">
        <div className="seg cmp-seg" role="tablist">
          <button className={vista === "compras" ? "on" : ""} onClick={() => setVista("compras")}>Facturas</button>
          <button className={vista === "proveedores" ? "on" : ""} onClick={() => setVista("proveedores")}>Proveedores</button>
        </div>
        {vista === "compras"
          ? <button className="btn primary press" onClick={() => setNueva(true)}><UIcono k="plus" sw={2.2} />Registrar compra</button>
          : <button className="btn primary press" onClick={() => setEditProv("nuevo")}><UIcono k="plus" sw={2.2} />Nuevo proveedor</button>}
      </div>
      {msg && <span className="pill ok" style={{ alignSelf: "flex-start" }}><UIcono k="check" sw={2.5} />{msg}</span>}
      <div className="inv-stats">
        <div className="inv-stat"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="box" /></span>
          <div><span className="k">Comprado este mes</span><span className="v t">{usd(delMes)}</span></div></div>
        <div className="inv-stat"><span className="ibox" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}><UIcono k="cash" /></span>
          <div><span className="k">Por pagar a proveedores</span><span className={"v t" + (porPagar > 0 ? " mg-bad" : "")}>{usd(porPagar)}</span></div></div>
      </div>
      {err && <p className="noresult">{err}</p>}

      {vista === "compras" ? (
        <div className="vt-list">
          {compras.map((c) => (
            <button key={c.compra.id} className={"card vt-row press" + (c.compra.estado === "ANULADA" ? " anulada" : "")} onClick={() => setAbierta(c.compra.id)}>
              <span className="vt-n t">{new Date(c.compra.fecha + "T12:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "short" })}</span>
              <span className="vt-tx"><b>{c.proveedor || "Sin proveedor"}</b><small>{c.compra.numeroFactura ? "Factura " + c.compra.numeroFactura : "Sin número"}</small></span>
              <span className="vt-m"><b className="t">{usd(c.compra.totalUsd)}</b>
                {c.compra.estado === "ANULADA" ? <span className="pill late">Anulada</span> : c.compra.pagada ? <span className="pill ok">Pagada</span> : <span className="pill soon">Por pagar</span>}</span>
            </button>
          ))}
          {compras.length === 0 && !err && <p className="noresult">Aún no hay compras. Registra la primera factura de un proveedor.</p>}
        </div>
      ) : (
        <div className="cli-list">
          {provs.map((p) => (
            <button key={p.id} className={"card cli-row press" + (p.activo ? "" : " off")} onClick={() => setEditProv(p)}>
              <span className="cli-nm"><b>{p.nombre}</b><small>{[p.rif, p.telefono, p.contacto].filter(Boolean).join(" · ") || "Sin datos"} · {p.compras} compra(s)</small></span>
              <span className="cli-sal">{p.porPagarUsd > 0 ? <b className="t mg-bad">{usd(p.porPagarUsd)}</b> : <b className="t cli-cero">Al día</b>}</span>
            </button>
          ))}
          {provs.length === 0 && !err && <p className="noresult">Anota tus proveedores (Polar, distribuidoras…).</p>}
        </div>
      )}
      {nueva && <FormCompra provs={provs} onClose={() => setNueva(false)} onSaved={(t) => { setNueva(false); setMsg(t); cargar(); }} onProv={cargar} />}
      {abierta != null && <DetalleCompra id={abierta} onClose={() => setAbierta(null)} onCambio={cargar} />}
      {editProv && <FormProveedor p={editProv === "nuevo" ? null : editProv} onClose={() => setEditProv(null)} onSaved={() => { setEditProv(null); cargar(); }} />}
    </div>
  );
}

function FormProveedor({ p, onClose, onSaved }: { p: ProveedorV | null; onClose: () => void; onSaved: (x: ProveedorV) => void }) {
  const [f, setF] = useState({ nombre: p?.nombre || "", rif: p?.rif || "", telefono: p?.telefono || "", contacto: p?.contacto || "" });
  const [activo, setActivo] = useState(p?.activo ?? true);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const guardar = async () => {
    try { onSaved(await guardarProveedor(p?.id ?? null, { nombre: f.nombre.trim(), rif: f.rif.trim() || undefined, telefono: f.telefono.trim() || undefined, contacto: f.contacto.trim() || undefined, activo })); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && f.nombre.trim()) { e.preventDefault(); guardar(); } else if (e.key === "Escape") onClose(); }}>
        <div className="modal-head"><h2>{p ? "Editar proveedor" : "Nuevo proveedor"}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <label className="lbl">Nombre<input autoFocus className="inp" value={f.nombre} onChange={set("nombre")} placeholder="Ej: Distribuidora Polar" aria-label="Nombre del proveedor" /></label>
          <div className="two">
            <label className="lbl">RIF <span className="opt">(opcional)</span><input className="inp" value={f.rif} onChange={set("rif")} placeholder="J-12345678-9" /></label>
            <label className="lbl">Teléfono <span className="opt">(opcional)</span><input className="inp" inputMode="tel" value={f.telefono} onChange={set("telefono")} /></label>
          </div>
          <label className="lbl">Vendedor / contacto <span className="opt">(opcional)</span><input className="inp" value={f.contacto} onChange={set("contacto")} /></label>
          {p && <button className="cfg-row press" role="switch" aria-checked={activo} onClick={() => setActivo(!activo)}><span className="cfg-tx"><b>Activo</b><small>Apágalo si ya no le compras.</small></span><span className={"sw" + (activo ? " on" : "")}><i /></span></button>}
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!f.nombre.trim()} onClick={guardar}>Guardar</button></div>
      </div>
    </div>
  );
}

interface Linea { p: Producto; cant: string; costo: string; precio: string; }

function FormCompra({ provs, onClose, onSaved, onProv }: { provs: ProveedorV[]; onClose: () => void; onSaved: (msg: string) => void; onProv: () => void }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [provId, setProvId] = useState<number | "">(provs.find((p) => p.activo)?.id ?? "");
  const [nuevoProv, setNuevoProv] = useState(false);
  const [factura, setFactura] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [pagada, setPagada] = useState(true);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { listarProductos().then(setProductos).catch((e) => setErr((e as Error).message)); }, []);
  const t = q.trim().toLowerCase();
  const sugeridos = useMemo(() => (t ? productos.filter((p) => (p.nombre.toLowerCase().includes(t) || p.codigoBarras.includes(t)) && !lineas.some((l) => l.p.id === p.id)).slice(0, 6) : []), [t, productos, lineas]);
  const agregar = (p: Producto) => { setLineas([...lineas, { p, cant: "", costo: p.costoUsd > 0 ? money(p.costoUsd) : "", precio: money(p.precioUsd) }]); setQ(""); };
  const upd = (i: number, k: keyof Linea, v: string) => setLineas(lineas.map((l, j) => (j === i ? { ...l, [k]: v.replace(/[^\d.,]/g, "") } : l)));
  const total = lineas.reduce((s, l) => s + (leerMonto(l.cant) ?? 0) * (leerMonto(l.costo) ?? 0), 0);
  const listo = lineas.length > 0 && lineas.every((l) => (leerMonto(l.cant) ?? 0) > 0 && (leerMonto(l.costo) ?? -1) >= 0) && !enviando;

  const guardar = async () => {
    if (!listo) return;
    setEnviando(true); setErr("");
    try {
      await registrarCompra({ proveedorId: provId === "" ? null : provId, numeroFactura: factura.trim() || undefined, fecha, tasa: Number(getTasa()) || undefined, pagada,
        items: lineas.map((l) => { const pr = leerMonto(l.precio) ?? 0; return { productoId: l.p.id, cantidad: leerMonto(l.cant) ?? 0, costoUsd: leerMonto(l.costo) ?? 0, ...(pr > 0 && Math.abs(pr - l.p.precioUsd) > 0.004 ? { precioVentaUsd: pr } : {}) }; }) });
      onSaved("Compra registrada: " + lineas.length + " producto(s) entraron al inventario");
    } catch (e) { setErr((e as Error).message); setEnviando(false); }
  };

  if (nuevoProv) return <FormProveedor p={null} onClose={() => setNuevoProv(false)} onSaved={(x) => { setNuevoProv(false); onProv(); setProvId(x.id); }} />;
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card cmp-card" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
        <div className="modal-head"><h2>Registrar compra</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div className="cmp-top">
            <label className="lbl">Proveedor
              <div className="cmp-prov">
                <select className="inp" value={provId} onChange={(e) => setProvId(e.target.value ? Number(e.target.value) : "")} aria-label="Proveedor">
                  <option value="">Sin proveedor</option>
                  {provs.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <button className="btn2 press" onClick={() => setNuevoProv(true)} title="Nuevo proveedor"><UIcono k="plus" sw={2.2} /></button>
              </div>
            </label>
            <label className="lbl">N° de factura<input className="inp" value={factura} placeholder="Opcional" onChange={(e) => setFactura(e.target.value)} aria-label="Número de factura" /></label>
            <label className="lbl">Fecha<input className="inp" type="date" value={fecha} max={hoy()} onChange={(e) => setFecha(e.target.value || hoy())} /></label>
          </div>
          <label className="search">
            <UIcono k="search" sw={2} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca el producto que llegó…" aria-label="Buscar producto para la compra"
              onKeyDown={(e) => { if (e.key === "Enter" && sugeridos[0]) { e.preventDefault(); agregar(sugeridos[0]); } }} />
          </label>
          {sugeridos.length > 0 && (
            <div className="cli-pick">{sugeridos.map((p) => (
              <button key={p.id} className="cli-pick-row press" onClick={() => agregar(p)}><b>{p.nombre}</b><small>Stock {money(p.stockActual)} · costo {usd(p.costoUsd)}</small><span className="t">{usd(p.precioUsd)}</span></button>
            ))}</div>
          )}
          {lineas.length > 0 && (
            <div className="cmp-lineas">
              <div className="cmp-row cmp-th"><span>Producto</span><span>Cantidad</span><span>Costo c/u $</span><span>Precio venta $</span><span /></div>
              {lineas.map((l, i) => {
                const c = leerMonto(l.cant) ?? 0, co = leerMonto(l.costo) ?? 0, pr = leerMonto(l.precio) ?? 0;
                const nuevo = c > 0 && co >= 0 ? costoPromedio(l.p.stockActual, l.p.costoUsd, c, co) : l.p.costoUsd;
                const margen = nuevo > 0 && pr > 0 ? Math.round(((pr - nuevo) / nuevo) * 100) : null;
                return (
                  <div key={l.p.id} className="cmp-row">
                    <span className="cmp-nm"><b>{l.p.nombre}</b><small>Costo nuevo {usd(nuevo)}{margen != null ? " · ganas " + margen + "%" : ""}</small></span>
                    <span className="cmp-in"><span>Cantidad</span><input className="inp t" inputMode="decimal" placeholder="0" value={l.cant} onChange={(e) => upd(i, "cant", e.target.value)} aria-label={"Cantidad de " + l.p.nombre} /></span>
                    <span className="cmp-in"><span>Costo c/u $</span><input className="inp t" inputMode="decimal" placeholder="0,00" value={l.costo} onChange={(e) => upd(i, "costo", e.target.value)} aria-label={"Costo de " + l.p.nombre} /></span>
                    <span className="cmp-in"><span>Precio venta $</span><input className={"inp t" + (margen != null && margen < 10 ? " bad" : "")} inputMode="decimal" value={l.precio} onChange={(e) => upd(i, "precio", e.target.value)} aria-label={"Precio de venta de " + l.p.nombre} /></span>
                    <button className="hdel" aria-label={"Quitar " + l.p.nombre} onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
          {lineas.length === 0 && <span className="hint">Busca cada producto de la factura y escribe cuántos llegaron y a cuánto los compraste. El costo promedio se calcula solo.</span>}
          <button className="cfg-row press" role="switch" aria-checked={pagada} onClick={() => setPagada(!pagada)}>
            <span className="cfg-tx"><b>{pagada ? "Ya está pagada" : "Queda por pagar"}</b><small>{pagada ? "Toca si se la vas a pagar después al proveedor." : "Aparecerá en “Por pagar a proveedores”."}</small></span>
            <span className={"sw" + (pagada ? " on" : "")}><i /></span>
          </button>
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!listo} onClick={guardar}>{enviando ? "Guardando…" : "Registrar compra · " + usd(Math.round(total * 100) / 100)}</button></div>
      </div>
    </div>
  );
}

function DetalleCompra({ id, onClose, onCambio }: { id: number; onClose: () => void; onCambio: () => void }) {
  const [c, setC] = useState<CompraVista | null>(null);
  const [err, setErr] = useState("");
  const cargar = () => detalleCompra(id).then(setC).catch((e) => setErr((e as Error).message));
  useEffect(() => { cargar(); }, [id]);
  const accion = async (fn: () => Promise<void>) => { try { await fn(); await cargar(); onCambio(); } catch (e) { setErr((e as Error).message); } };
  if (!c) return <div className="modal"><div className="modal-card"><div className="modal-body"><span className="hint">{err || "Cargando…"}</span></div></div></div>;
  const viva = c.compra.estado === "REGISTRADA";
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>{c.proveedor || "Compra"}{c.compra.numeroFactura ? " · " + c.compra.numeroFactura : ""}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div className="vt-res"><span>{new Date(c.compra.fecha + "T12:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })}</span>
            <b className="t">{usd(c.compra.totalUsd)}</b>
            {!viva ? <span className="pill late">Anulada</span> : c.compra.pagada ? <span className="pill ok">Pagada</span> : <span className="pill soon">Por pagar</span>}</div>
          <div className="vt-lineas">{c.detalles.map((d) => (
            <div key={d.id} className="vt-linea"><span className="vt-ln"><b>{d.nombre}</b><small className="t">{money(d.cantidad)} × {usd(d.costoUnitarioUsd)}</small></span><b className="t">{usd(d.subtotalUsd)}</b></div>
          ))}</div>
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        {viva && (
          <div className="modal-foot two-btn">
            <button className="btn2 big press" onClick={() => accion(() => compraPagada(c.compra.id, !c.compra.pagada))}>{c.compra.pagada ? "Marcar por pagar" : "Marcar pagada"}</button>
            <button className="btn danger big press" onClick={() => { if (window.confirm("¿Anular la compra? Se saca del inventario lo que entró.")) accion(() => anularCompra(c.compra.id)); }}>Anular compra</button>
          </div>
        )}
      </div>
    </div>
  );
}
