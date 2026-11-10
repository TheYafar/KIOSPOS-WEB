import { useEffect, useMemo, useState } from "react";
import { ajustarStock, crearProducto, importarCsv, listarProductos, type Producto } from "../api";
import { Icono, UIcono, catInfo } from "../icons";

const usd = (n: number) => "$ " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (s: string) => (s ? parseFloat(s.replace(",", ".")) || 0 : 0);

type Modal = null | { tipo: "nuevo" } | { tipo: "ajuste"; p: Producto } | { tipo: "csv" };

export function Inventario() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const cargar = () => listarProductos().then(setProductos).catch((e) => setErr((e as Error).message));
  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return productos.filter((p) => !t || p.nombre.toLowerCase().includes(t) || p.codigoBarras.includes(t));
  }, [productos, q]);

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
        <button className="btn outline press" onClick={() => setModal({ tipo: "csv" })}>CSV</button>
      </div>
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
                <b className="t">{p.stockActual}{p.esPesable ? " " + p.unidadMedida : ""}</b>
                {out ? <span className="pill danger">Agotado</span> : low ? <span className="pill warn">Bajo</span> : <span className="stk">{sbar(p)}</span>}
              </div>
            </button>
          );
        })}</div>
        {filtrados.length === 0 && !err && <p className="noresult">Sin productos. Crea uno o importa un CSV.</p>}
      </div>

      {modal?.tipo === "nuevo" && <FormNuevo onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg("Producto creado"); cargar(); }} onErr={setErr} />}
      {modal?.tipo === "ajuste" && <FormAjuste p={modal.p} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMsg("Stock ajustado"); cargar(); }} onErr={setErr} />}
      {modal?.tipo === "csv" && <FormCsv onClose={() => setModal(null)} onSaved={(r) => { setModal(null); setMsg(`Importados: ${r.creados} nuevos, ${r.actualizados} actualizados`); cargar(); }} onErr={setErr} />}
    </div>
  );
}

function FormNuevo({ onClose, onSaved, onErr }: { onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
  const [f, setF] = useState({ codigoBarras: "", nombre: "", precioUsd: "", costoUsd: "", categoria: "General", stockInicial: "" });
  const [pesable, setPesable] = useState(false);
  const [unidad, setUnidad] = useState("KG");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const guardar = async () => {
    try { await crearProducto({ codigoBarras: f.codigoBarras.trim(), nombre: f.nombre.trim(), precioUsd: num(f.precioUsd), costoUsd: num(f.costoUsd), categoria: f.categoria, stockInicial: num(f.stockInicial), esPesable: pesable, unidadMedida: pesable ? unidad : "UND" }); onSaved(); }
    catch (e) { onErr((e as Error).message); onClose(); }
  };
  const ok = f.codigoBarras.trim() && f.nombre.trim() && num(f.precioUsd) > 0;
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>Nuevo producto</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <label className="lbl">Código de barras<input className="inp" value={f.codigoBarras} onChange={set("codigoBarras")} /></label>
          <label className="lbl">Nombre<input className="inp" value={f.nombre} onChange={set("nombre")} /></label>
          <button className="cfg-row press" role="switch" aria-checked={pesable} onClick={() => setPesable(!pesable)}>
            <span className="cfg-tx"><b>Se vende por peso o medida</b><small>Queso, carne, granos, refresco a granel, tela… Al vender se escribe cuánto lleva.</small></span>
            <span className={"sw" + (pesable ? " on" : "")}><i /></span>
          </button>
          {pesable && (
            <div className="seg cfg-seg" role="tablist" aria-label="Unidad de medida">
              {[["KG", "Kilo"], ["G", "Gramo"], ["L", "Litro"], ["M", "Metro"]].map(([u, n]) => <button key={u} className={unidad === u ? "on" : ""} onClick={() => setUnidad(u)}>{n}</button>)}
            </div>
          )}
          <div className="two">
            <label className="lbl">{pesable ? "Precio $ por " + ({ KG: "kilo", G: "gramo", L: "litro", M: "metro" } as Record<string, string>)[unidad] : "Precio $"}<input className="inp" inputMode="decimal" value={f.precioUsd} onChange={set("precioUsd")} aria-label="Precio" /></label>
            <label className="lbl">Costo $<input className="inp" inputMode="decimal" value={f.costoUsd} onChange={set("costoUsd")} /></label>
          </div>
          <div className="two">
            <label className="lbl">Categoría<input className="inp" value={f.categoria} onChange={set("categoria")} /></label>
            <label className="lbl">{pesable ? "Hay (" + ({ KG: "kg", G: "g", L: "L", M: "m" } as Record<string, string>)[unidad] + ")" : "Stock inicial"}<input className="inp" inputMode="decimal" value={f.stockInicial} onChange={set("stockInicial")} /></label>
          </div>
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!ok} onClick={guardar}>Guardar</button></div>
      </div>
    </div>
  );
}

function FormAjuste({ p, onClose, onSaved, onErr }: { p: Producto; onClose: () => void; onSaved: () => void; onErr: (s: string) => void }) {
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
            <div><span className="k">Stock actual</span><span className="v t">{p.stockActual}{p.esPesable ? " " + p.unidadMedida : ""}</span></div></div>
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
