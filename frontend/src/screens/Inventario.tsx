import { useEffect, useMemo, useState } from "react";
import { actualizarProducto, ajustarStock, borrarCategoria, crearCategoria, crearProducto, guardarPresentaciones, importarCsv, listarCategorias, listarPresentaciones, listarProductos, renombrarCategoria, type Categoria, type Producto } from "../api";
import { EditorBloques, filasDe, leerBloques, type FilaBloque } from "./Bloques";
import { cantTxt } from "./Pesable";
import { Icono, UIcono, catInfo } from "../icons";

const usd = (n: number) => "$ " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (s: string) => (s ? parseFloat(s.replace(",", ".")) || 0 : 0);

type Modal = null | { tipo: "nuevo" } | { tipo: "editar"; p: Producto } | { tipo: "ajuste"; p: Producto } | { tipo: "csv" } | { tipo: "categorias" };
const UNIDAD_N: Record<string, string> = { KG: "kilo", G: "gramo", L: "litro", M: "metro" };
const UNIDAD_C: Record<string, string> = { KG: "kg", G: "g", L: "L", M: "m" };

export function Inventario() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [cats, setCats] = useState<Categoria[]>([]);
  const [cat, setCat] = useState("");

  const cargar = () => {
    listarProductos().then(setProductos).catch((e) => setErr((e as Error).message));
    listarCategorias().then(setCats).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return productos.filter((p) => (!cat || p.categoria === cat) && (!t || p.nombre.toLowerCase().includes(t) || p.codigoBarras.includes(t)));
  }, [productos, q, cat]);

  const valorInv = productos.reduce((s, p) => s + p.precioUsd * p.stockActual, 0);
  const bajos = productos.filter((p) => p.stockActual <= p.stockMinimo).length;

  const sbar = (p: Producto) => {
    const k = p.stockActual <= 0 ? "out" : p.stockActual <= p.stockMinimo ? "low" : "";
    const pct = Math.max(4, Math.min(100, Math.round((p.stockActual / Math.max(p.stockMinimo * 3, 1)) * 100)));
    return <span className={"sbar " + k}><i style={{ width: (k === "out" ? 0 : pct) + "%" }} /></span>;
  };

  return (
    <div className="caja">
      <div className="toolbar">
        <div className="search" style={{ flex: 1 }}><UIcono k="search" /><input placeholder="Buscar producto o código…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn primary press" onClick={() => setModal({ tipo: "nuevo" })}><UIcono k="plus" sw={2.2} />Nuevo</button>
        <button className="btn outline press" onClick={() => setModal({ tipo: "categorias" })}>Categorías</button>
        <button className="btn outline press" onClick={() => setModal({ tipo: "csv" })}>CSV</button>
      </div>
      {cats.length > 1 && (
        <div className="inv-cats" role="tablist" aria-label="Filtrar por categoría">
          <button className={"chip press" + (!cat ? " on" : "")} onClick={() => setCat("")}>Todas · {productos.length}</button>
          {cats.filter((c) => c.productos > 0 || c.nombre !== "General").map((c) => (
            <button key={c.nombre} className={"chip press" + (cat === c.nombre ? " on" : "")} onClick={() => setCat(cat === c.nombre ? "" : c.nombre)}>{c.nombre} · {c.productos}</button>
          ))}
        </div>
      )}
      {msg && <div className="toolbar" style={{ paddingTop: 0 }}><span className="pill ok"><UIcono k="check" sw={2.5} />{msg}</span></div>}
      <div className="scroll">
        <div className="inv-stats">
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}><UIcono k="box" /></span>
            <div><span className="k">Productos</span><span className="v t">{productos.length}</span></div></div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}><UIcono k="alert" /></span>
            <div><span className="k">Bajo mínimo</span><span className={"v t" + (bajos ? " mg-low" : "")}>{bajos}</span></div></div>
          <div className="inv-stat wide"><span className="ibox" style={{ background: "var(--accent-soft)", color: "var(--warn)" }}><UIcono k="cash" /></span>
            <div><span className="k">Valor del inventario (a precio de venta)</span><span className="v t">{usd(valorInv)}</span></div></div>
        </div>
        {err && <p className="noresult">{err}</p>}
        <div className="inv-list">{filtrados.map((p) => {
          const info = catInfo(p.categoria);
          const margen = p.costoUsd > 0 ? Math.round(((p.precioUsd - p.costoUsd) / p.costoUsd) * 100) : 0;
          const out = p.stockActual <= 0; const low = !out && p.stockActual <= p.stockMinimo;
          return (
            <button key={p.id} className="irow press" onClick={() => setModal({ tipo: "ajuste", p })}>
              <span className="pi" style={{ ["--c" as string]: info.cat ? `var(--c-${info.cat})` : "var(--text-3)" }}><Icono k={info.icon} /></span>
              <div style={{ minWidth: 0 }}><div className="nm">{p.nombre}</div>
                <div className="mt"><span>{usd(p.precioUsd)}</span><span>·</span><span className={margen < 10 ? "mg-low" : ""}>+{margen}%</span><span>·</span><span>{p.categoria}</span></div>
              </div>
              <div className="rt">
                <b className="t">{cantTxt(p, p.stockActual)}</b>
                {out ? <span className="pill danger">Agotado</span> : low ? <span className="pill warn">Bajo</span> : <span className="stk">{sbar(p)}</span>}
              </div>
            </button>
          );
        })}</div>
        {filtrados.length === 0 && !err && <p className="noresult">Sin productos. Crea uno o importa un CSV.</p>}
      </div>

      {modal?.tipo === "nuevo" && <FormProducto cats={cats} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg("Producto creado"); cargar(); }} />}
      {modal?.tipo === "editar" && <FormProducto p={modal.p} cats={cats} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg("Producto actualizado"); cargar(); }} />}
      {modal?.tipo === "ajuste" && <FormAjuste p={modal.p} onEditar={() => setModal({ tipo: "editar", p: modal.p })} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg("Stock ajustado"); cargar(); }} onErr={setErr} />}
      {modal?.tipo === "categorias" && <FormCategorias cats={cats} onClose={() => setModal(null)} onCambio={(t) => { setMsg(t); cargar(); }} />}
      {modal?.tipo === "csv" && <FormCsv onClose={() => setModal(null)} onSaved={(r) => { setModal(null); setMsg(`Importados: ${r.creados} nuevos, ${r.actualizados} actualizados`); cargar(); }} onErr={setErr} />}
    </div>
  );
}

/** Crear o editar un producto: categoría de una lista (o nueva) y si se vende por peso o medida. */
function FormProducto({ p, cats, onClose, onSaved }: { p?: Producto; cats: Categoria[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    codigoBarras: p?.codigoBarras ?? "", nombre: p?.nombre ?? "", precioUsd: p ? String(p.precioUsd).replace(".", ",") : "",
    costoUsd: p && p.costoUsd ? String(p.costoUsd).replace(".", ",") : "", stockInicial: "", stockMinimo: p && p.stockMinimo ? String(p.stockMinimo).replace(".", ",") : "",
  });
  const [categoria, setCategoria] = useState(p?.categoria ?? (cats.find((c) => c.nombre !== "General")?.nombre || "General"));
  const [nuevaCat, setNuevaCat] = useState<string | null>(null);
  const [pesable, setPesable] = useState(p?.esPesable ?? false);
  const [unidad, setUnidad] = useState(p?.esPesable ? (p.unidadMedida || "KG").toUpperCase() : "KG");
  const [err, setErr] = useState("");
  // Bloques (caja, media caja, saco...): se cargan los que ya tiene y se guardan junto al producto.
  const [bloques, setBloques] = useState<FilaBloque[]>([]);
  const [teniaBloques, setTeniaBloques] = useState(false);
  useEffect(() => {
    if (!p) return;
    listarPresentaciones().then((l) => { const m = l.filter((b) => b.productoId === p.id); setBloques(filasDe(m)); setTeniaBloques(m.length > 0); }).catch(() => {});
  }, [p?.id]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const catFinal = nuevaCat != null ? nuevaCat.trim() : categoria;
  const ok = f.codigoBarras.trim() && f.nombre.trim() && num(f.precioUsd) > 0 && catFinal;
  const guardar = async () => {
    if (!ok) return;
    const d = { codigoBarras: f.codigoBarras.trim(), nombre: f.nombre.trim(), precioUsd: num(f.precioUsd), costoUsd: num(f.costoUsd), categoria: catFinal,
      stockMinimo: num(f.stockMinimo), esPesable: pesable, unidadMedida: pesable ? unidad : "UND" };
    const bl = leerBloques(bloques);
    if (!bl.ok) { setErr(bl.error); return; }
    try {
      const guardado = p ? await actualizarProducto(p.id, d) : await crearProducto({ ...d, stockInicial: num(f.stockInicial) });
      if (bl.lista.length > 0 || teniaBloques) await guardarPresentaciones(guardado.id ?? p!.id, bl.lista);
      onSaved();
    }
    catch (e) { setErr((e as Error).message); }
  };
  const u = pesable ? UNIDAD_C[unidad] : "";
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
        <div className="modal-head"><h2>{p ? "Editar producto" : "Nuevo producto"}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div className="two">
            <label className="lbl">Código de barras<input className="inp" autoFocus={!p} value={f.codigoBarras} onChange={set("codigoBarras")} aria-label="Código de barras" placeholder="Escanéalo o inventa uno" /></label>
            <label className="lbl">Nombre<input className="inp" value={f.nombre} onChange={set("nombre")} aria-label="Nombre del producto" /></label>
          </div>
          <div className="lbl">Categoría
            {nuevaCat == null ? (
              <div className="cmp-prov">
                <select className="inp" value={categoria} onChange={(e) => { if (e.target.value === "__nueva") setNuevaCat(""); else setCategoria(e.target.value); }} aria-label="Categoría">
                  {cats.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                  {!cats.some((c) => c.nombre === categoria) && <option value={categoria}>{categoria}</option>}
                  <option value="__nueva">＋ Nueva categoría…</option>
                </select>
                <button className="btn2 press" title="Nueva categoría" onClick={() => setNuevaCat("")}><UIcono k="plus" sw={2.2} /></button>
              </div>
            ) : (
              <div className="cmp-prov">
                <input className="inp" autoFocus value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} placeholder="Ej: Charcutería, Bebidas, Limpieza" aria-label="Nombre de la categoría nueva" />
                <button className="btn2 press" onClick={() => setNuevaCat(null)}>Elegir de la lista</button>
              </div>
            )}
          </div>
          <button className="cfg-row press" role="switch" aria-checked={pesable} onClick={() => setPesable(!pesable)}>
            <span className="cfg-tx"><b>Se vende por peso o medida</b><small>Queso, carne, granos, a granel, tela… Al vender se escribe cuánto lleva.</small></span>
            <span className={"sw" + (pesable ? " on" : "")}><i /></span>
          </button>
          {pesable && (
            <div className="seg uni-seg" role="tablist" aria-label="Unidad de medida">
              {Object.entries(UNIDAD_N).map(([k, n]) => <button key={k} className={unidad === k ? "on" : ""} onClick={() => setUnidad(k)}>{n.charAt(0).toUpperCase() + n.slice(1)}</button>)}
            </div>
          )}
          <div className="two">
            <label className="lbl">{pesable ? "Precio $ por " + UNIDAD_N[unidad] : "Precio $"}<input className="inp" inputMode="decimal" value={f.precioUsd} onChange={set("precioUsd")} aria-label="Precio" /></label>
            <label className="lbl">{pesable ? "Costo $ por " + UNIDAD_N[unidad] : "Costo $"}<input className="inp" inputMode="decimal" value={f.costoUsd} onChange={set("costoUsd")} aria-label="Costo" /></label>
          </div>
          <div className="two">
            {!p && <label className="lbl">{pesable ? "Hay (" + u + ")" : "Stock inicial"}<input className="inp" inputMode="decimal" value={f.stockInicial} onChange={set("stockInicial")} aria-label="Stock inicial" /></label>}
            <label className="lbl">Avisar cuando quede{pesable ? " (" + u + ")" : ""}<input className="inp" inputMode="decimal" value={f.stockMinimo} onChange={set("stockMinimo")} placeholder="0" aria-label="Stock mínimo" /></label>
          </div>
          {p && <span className="hint">El stock se cambia con “Ajustar” (entra / sale / fijar).</span>}
          <EditorBloques filas={bloques} setFilas={setBloques} producto={{ precioUsd: num(f.precioUsd), esPesable: pesable, unidadMedida: unidad }} />
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!ok} onClick={guardar}>Guardar</button></div>
      </div>
    </div>
  );
}

/** Administrar categorías: crear, renombrar y borrar (sus productos pasan a "General"). */
function FormCategorias({ cats, onClose, onCambio }: { cats: Categoria[]; onClose: () => void; onCambio: (msg: string) => void }) {
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<{ de: string; a: string } | null>(null);
  const [err, setErr] = useState("");
  const correr = async (fn: () => Promise<unknown>, msg: string) => { setErr(""); try { await fn(); onCambio(msg); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
        <div className="modal-head"><h2>Categorías</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div className="cmp-prov">
            <input className="inp" autoFocus value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva categoría (ej. Charcutería)" aria-label="Nueva categoría"
              onKeyDown={(e) => { if (e.key === "Enter" && nueva.trim()) correr(() => crearCategoria(nueva).then(() => setNueva("")), "Categoría creada"); }} />
            <button className="btn primary press" disabled={!nueva.trim()} onClick={() => correr(() => crearCategoria(nueva).then(() => setNueva("")), "Categoría creada")}><UIcono k="plus" sw={2.2} />Agregar</button>
          </div>
          {err && <p className="pinmsg err">{err}</p>}
          <div className="cat-list">
            {cats.map((c) => (
              <div key={c.nombre} className="cat-row">
                {editando?.de === c.nombre ? (
                  <>
                    <input className="inp" autoFocus value={editando.a} onChange={(e) => setEditando({ ...editando, a: e.target.value })} aria-label={"Nuevo nombre de " + c.nombre}
                      onKeyDown={(e) => { if (e.key === "Enter" && editando.a.trim()) correr(() => renombrarCategoria(c.nombre, editando.a).then(() => setEditando(null)), "Categoría renombrada"); }} />
                    <button className="btn primary press" onClick={() => correr(() => renombrarCategoria(c.nombre, editando.a).then(() => setEditando(null)), "Categoría renombrada")}>Guardar</button>
                  </>
                ) : (
                  <>
                    <span className="cat-nm"><b>{c.nombre}</b><small>{c.productos} producto(s)</small></span>
                    {c.nombre !== "General" && <>
                      <button className="btn2 press" onClick={() => setEditando({ de: c.nombre, a: c.nombre })}>Renombrar</button>
                      <button className="hdel" aria-label={"Borrar " + c.nombre} onClick={() => { if (window.confirm(`¿Borrar "${c.nombre}"?` + (c.productos ? ` Sus ${c.productos} producto(s) pasan a "General".` : ""))) correr(() => borrarCategoria(c.nombre), "Categoría borrada"); }}>✕</button>
                    </>}
                  </>
                )}
              </div>
            ))}
          </div>
          <span className="hint">Las categorías salen como botones en Vender para encontrar rápido los productos.</span>
        </div>
      </div>
    </div>
  );
}

function FormAjuste({ p, onEditar, onClose, onSaved, onErr }: { p: Producto; onEditar: () => void; onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
  const [tipo, setTipo] = useState<"ENTRADA" | "SALIDA" | "FIJAR">("ENTRADA");
  const [cant, setCant] = useState("");
  const [motivo, setMotivo] = useState("");
  const guardar = async () => {
    try { await ajustarStock(p.id, tipo, num(cant), motivo); onSaved(); } catch (e) { onErr((e as Error).message); onClose(); }
  };
  const tipos: { id: typeof tipo; n: string }[] = [{ id: "ENTRADA", n: "Entra" }, { id: "SALIDA", n: "Sale" }, { id: "FIJAR", n: "Fijar" }];
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>{p.nombre}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}><UIcono k="box" /></span>
            <div><span className="k">Stock actual · {p.categoria}</span><span className="v t">{cantTxt(p, p.stockActual)}</span></div>
            <button className="btn2 press inv-editar" onClick={onEditar}>Editar datos</button></div>
          <div className="seg">
            {tipos.map((x) => <button key={x.id} className={tipo === x.id ? "on" : ""} onClick={() => setTipo(x.id)}>{x.n}</button>)}
          </div>
          <label className="lbl">{tipo === "FIJAR" ? "Dejar el stock en" : "Cantidad"}<input className="inp" inputMode="decimal" value={cant} onChange={(e) => setCant(e.target.value)} /></label>
          <label className="lbl">Motivo (opcional)<input className="inp" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Compra, merma, conteo…" /></label>
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={num(cant) < 0 || !cant} onClick={guardar}>Ajustar</button></div>
      </div>
    </div>
  );
}

function FormCsv({ onClose, onSaved, onErr }: { onClose: () => void; onSaved: (r: { creados: number; actualizados: number }) => void; onErr: (s: string) => void }) {
  const [csv, setCsv] = useState("codigo_barras,nombre,precio_usd,costo_usd,categoria,stock,stock_minimo\n");
  const subir = async () => { try { onSaved(await importarCsv(csv)); } catch (e) { onErr((e as Error).message); onClose(); } };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Importar CSV</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <span className="hint">Columnas: codigo_barras, nombre, precio_usd, costo_usd, categoria, stock, stock_minimo. Si el código ya existe, se actualiza.</span>
          <textarea className="inp" style={{ height: 180, padding: 12, fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.5 }} value={csv} onChange={(e) => setCsv(e.target.value)} />
        </div>
        <div className="modal-foot"><button className="btn primary big press" onClick={subir}>Importar</button></div>
      </div>
    </div>
  );
}
