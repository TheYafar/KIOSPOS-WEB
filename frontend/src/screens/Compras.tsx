import { hoyVe } from "../dia";
import { useEffect, useMemo, useRef, useState } from "react";
import { abonarCompra, anularCompra, borrarFotoCompra, compraPagada, detalleCompra, fotoCompra, guardarProveedor, listarCompras, listarProductos, listarProveedores, registrarCompra, subirFotoCompra,
  type CompraVista, type FotoMeta, type Producto, type ProveedorV } from "../api";
import { getTasa } from "../session";
import { UIcono } from "../icons";
import { leerMonto } from "../arqueo";
import { prepararFoto, type FotoLista } from "../foto";

// Compras a proveedores: registrar la factura suma la mercancía al inventario y
// recalcula el costo promedio de cada producto. Se puede dejar "por pagar".

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const hoy = () => hoyVe();
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
  const cargar = () => Promise.all([listarCompras(), listarProveedores()]).then(([c, p]) => { setCompras(c); setProvs(p); setErr(""); window.dispatchEvent(new Event("kp-avisos")); }).catch((e) => setErr((e as Error).message));
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
  const [vence, setVence] = useState("");
  const [fotos, setFotos] = useState<FotoLista[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const elegirFotos = async (files: FileList | null) => {
    if (!files) return;
    setErr("");
    try {
      const nuevas: FotoLista[] = [];
      for (const f of Array.from(files).slice(0, 6)) nuevas.push(await prepararFoto(f));
      setFotos((prev) => [...prev, ...nuevas].slice(0, 6));
    } catch (e) { setErr((e as Error).message); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const guardar = async () => {
    if (!listo) return;
    setEnviando(true); setErr("");
    try {
      const v = await registrarCompra({ proveedorId: provId === "" ? null : provId, numeroFactura: factura.trim() || undefined, fecha,
        vence: !pagada && vence ? vence : undefined, tasa: Number(getTasa()) || undefined, pagada,
        items: lineas.map((l) => { const pr = leerMonto(l.precio) ?? 0; return { productoId: l.p.id, cantidad: leerMonto(l.cant) ?? 0, costoUsd: leerMonto(l.costo) ?? 0, ...(pr > 0 && Math.abs(pr - l.p.precioUsd) > 0.004 ? { precioVentaUsd: pr } : {}) }; }) });
      for (const foto of fotos) { try { await subirFotoCompra(v.compra.id, foto.mime, foto.datos); } catch { /* la foto no debe tumbar la compra */ } }
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
          {!pagada && (
            <label className="lbl">¿Cuándo hay que pagarla? <span className="opt">(opcional, para avisarte)</span>
              <input className="inp" type="date" value={vence} min={fecha} onChange={(e) => setVence(e.target.value)} aria-label="Fecha de pago" /></label>
          )}
          <div className="cmp-fotos">
            <div className="cmp-fotos-h"><b>Foto de la factura</b><small className="opt">Tómale una foto al papel para guardarla aquí.</small></div>
            <div className="fac-fotos">
              {fotos.map((f, i) => (
                <div key={i} className="fac-foto">
                  <img src={"data:" + f.mime + ";base64," + f.datos} alt={"Foto " + (i + 1)} />
                  <button type="button" className="fac-foto-x" aria-label="Quitar foto" onClick={() => setFotos(fotos.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {fotos.length < 6 && (
                <button type="button" className="fac-foto-add press" onClick={() => fileRef.current?.click()} aria-label="Agregar foto de la factura">
                  <UIcono k="plus" sw={2.2} /><span>Foto</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => elegirFotos(e.target.files)} />
          </div>
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!listo} onClick={guardar}>{enviando ? "Guardando…" : "Registrar compra · " + usd(Math.round(total * 100) / 100)}</button></div>
      </div>
    </div>
  );
}

const fecha11 = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "short" });

function DetalleCompra({ id, onClose, onCambio }: { id: number; onClose: () => void; onCambio: () => void }) {
  const [c, setC] = useState<CompraVista | null>(null);
  const [err, setErr] = useState("");
  const [abono, setAbono] = useState("");
  const [metodo, setMetodo] = useState("EFECTIVO_USD");
  const [yendo, setYendo] = useState(false);
  const [imgs, setImgs] = useState<Record<number, string>>({});
  const [ver, setVer] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cargar = () => detalleCompra(id).then(setC).catch((e) => setErr((e as Error).message));
  useEffect(() => { cargar(); }, [id]);
  useEffect(() => {
    if (!c) return;
    c.fotos.forEach((f: FotoMeta) => {
      if (imgs[f.id]) return;
      fotoCompra(id, f.id).then((d) => setImgs((m) => ({ ...m, [f.id]: "data:" + d.mime + ";base64," + d.datos }))).catch(() => {});
    });
  }, [c]);
  const accion = async (fn: () => Promise<void>) => { setYendo(true); try { await fn(); await cargar(); onCambio(); } catch (e) { setErr((e as Error).message); } finally { setYendo(false); } };
  if (!c) return <div className="modal"><div className="modal-card"><div className="modal-body"><span className="hint">{err || "Cargando…"}</span></div></div></div>;
  const viva = c.compra.estado === "REGISTRADA";
  const saldo = c.saldoUsd;
  const monto = leerMonto(abono) ?? 0;
  const abonar = async () => {
    if (monto <= 0) return;
    setErr("");
    await accion(async () => { await abonarCompra(id, monto, metodo); setAbono(""); });
  };
  const agregarFoto = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    setErr("");
    try { const f = await prepararFoto(files[0]); await subirFotoCompra(id, f.mime, f.datos); await cargar(); }
    catch (e) { setErr((e as Error).message); }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>{c.proveedor || "Compra"}{c.compra.numeroFactura ? " · " + c.compra.numeroFactura : ""}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div className="vt-res"><span>{new Date(c.compra.fecha + "T12:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })}</span>
            <b className="t">{usd(c.compra.totalUsd)}</b>
            {!viva ? <span className="pill late">Anulada</span> : c.compra.pagada ? <span className="pill ok">Pagada</span> : <span className="pill soon">Por pagar</span>}</div>

          {viva && !c.compra.pagada && (
            <div className="cmp-saldo">
              <div className="cmp-saldo-r"><span>Abonado</span><b className="t">{usd(c.compra.pagadoUsd)}</b></div>
              <div className="cmp-saldo-r big"><span>Saldo por pagar</span><b className="t mg-bad">{usd(saldo)}</b></div>
              {c.compra.vence && <div className="cmp-saldo-r"><span>Pagar antes del</span><b className="t">{new Date(c.compra.vence + "T12:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "long" })}</b></div>}
              <div className="cmp-abonar">
                <input className="inp t" inputMode="decimal" placeholder="0,00" value={abono} onChange={(e) => setAbono(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Monto a abonar en dólares" />
                <select className="inp" value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Forma de pago del abono">
                  <option value="EFECTIVO_USD">Efectivo $</option><option value="EFECTIVO_BS">Efectivo Bs</option>
                  <option value="PAGO_MOVIL">Pago móvil</option><option value="PUNTO">Punto</option>
                  <option value="TRANSFERENCIA">Transferencia</option><option value="ZELLE">Zelle</option><option value="OTRO">Otra</option>
                </select>
                <button className="btn primary press" disabled={monto <= 0 || yendo} onClick={abonar}>Abonar</button>
              </div>
              <button className="btn2 press cmp-pagar-todo" disabled={yendo} onClick={() => accion(() => compraPagada(id, true))}>Pagué todo (al contado) · {usd(saldo)}</button>
            </div>
          )}

          <div className="vt-lineas">{c.detalles.map((d) => (
            <div key={d.id} className="vt-linea"><span className="vt-ln"><b>{d.nombre}</b><small className="t">{money(d.cantidad)} × {usd(d.costoUnitarioUsd)}</small></span><b className="t">{usd(d.subtotalUsd)}</b></div>
          ))}</div>

          {c.abonos.length > 0 && (
            <div className="cmp-abonos">
              <b className="cmp-sub">Abonos</b>
              {c.abonos.map((a) => (
                <div key={a.id} className="cmp-abono-r"><span>{fecha11(a.fecha)}{a.metodo ? " · " + (METODO_ABONO[a.metodo] || a.metodo) : ""}</span><b className="t">{usd(a.montoUsd)}</b></div>
              ))}
            </div>
          )}

          <div className="cmp-fotos">
            <div className="cmp-fotos-h"><b>Foto de la factura</b></div>
            <div className="fac-fotos">
              {c.fotos.map((f) => (
                <div key={f.id} className="fac-foto">
                  {imgs[f.id] ? <img src={imgs[f.id]} alt="Factura" onClick={() => setVer(f.id)} /> : <span className="fac-foto-ld">…</span>}
                  <button type="button" className="fac-foto-x" aria-label="Quitar foto" onClick={() => accion(() => borrarFotoCompra(id, f.id))}>✕</button>
                </div>
              ))}
              {c.fotos.length < 6 && (
                <button type="button" className="fac-foto-add press" onClick={() => fileRef.current?.click()} aria-label="Agregar foto de la factura"><UIcono k="plus" sw={2.2} /><span>Foto</span></button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => agregarFoto(e.target.files)} />
          </div>
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        {viva && (
          <div className="modal-foot two-btn">
            <button className="btn2 big press" disabled={yendo} onClick={() => accion(() => compraPagada(id, !c.compra.pagada))}>{c.compra.pagada ? "Marcar por pagar" : "Marcar pagada"}</button>
            <button className="btn danger big press" disabled={yendo} onClick={() => { if (window.confirm("¿Anular la compra? Se saca del inventario lo que entró.")) accion(() => anularCompra(id)); }}>Anular compra</button>
          </div>
        )}
      </div>
      {ver != null && imgs[ver] && (
        <div className="foto-ver" onClick={() => setVer(null)}><img src={imgs[ver]} alt="Factura" /><button className="foto-ver-x" aria-label="Cerrar">✕</button></div>
      )}
    </div>
  );
}

const METODO_ABONO: Record<string, string> = { EFECTIVO_USD: "Efectivo $", EFECTIVO_BS: "Efectivo Bs", PAGO_MOVIL: "Pago móvil", PUNTO: "Punto", TRANSFERENCIA: "Transferencia", ZELLE: "Zelle", OTRO: "Otra" };
