import { useEffect, useMemo, useRef, useState } from "react";
import { cobrar, facturaDe, getConfigNegocio, getTasa, listarPresentaciones, listarProductos, type PagoCobro, type Presentacion, type Producto } from "../api";
import { ElegirBloque, comoProducto } from "./Bloques";
import { conectorDisponible, imprimirTicket } from "../conector";
import { Icono, UIcono, catInfo } from "../icons";
import { Cobro, type ResumenPago } from "./Cobro";
import { CantidadPesable, cantTxt } from "./Pesable";
import { planSuspendido } from "../plan";
import { Recargas } from "./Recargas";
import { useAtras } from "../atras";
import { numFactura } from "./Factura";
import { armarTicket, type NegocioTicket } from "../ticket";

// Un bloque (caja, media caja) va como "producto virtual" con id negativo; base y bloque
// dicen qué producto y qué presentación se mandan al servidor.
interface Item { producto: Producto; qty: number; base?: Producto; bloque?: Presentacion; }

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Done { total: number; totalBs: number; payLine: string; change: string; changeNote: string; receipt: string; factura?: number; credito?: ResumenPago["credito"]; }

/** True en escritorio/tablet (riel lateral). Reacciona al cambiar el ancho. */
function useIsDesktop(): boolean {
  const [d, setD] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width:760px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width:760px)");
    const h = () => setD(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return d;
}

export function Caja() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [carrito, setCarrito] = useState<Map<number, Item>>(new Map());
  const [view, setView] = useState<"caja" | "ticket" | "checkout" | "done">("caja");
  const [recargas, setRecargas] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [err, setErr] = useState("");
  const [selIdx, setSelIdx] = useState(0); // producto resaltado con ↑↓ al buscar
  const buscarRef = useRef<HTMLInputElement>(null);

  const tasa = Number(getTasa()) || 1;
  // Datos del negocio para el ticket (copia local para cobrar sin internet).
  const [negocio, setNegocio] = useState<NegocioTicket>(() => { try { return JSON.parse(localStorage.getItem("kp_negocio") || "null") || { nombre: "" }; } catch { return { nombre: "" }; } });
  useEffect(() => {
    getConfigNegocio().then((c) => {
      const n = { nombre: c.nombre, frase: c.mensajeTicket, rif: c.rif, direccion: c.direccion, telefono: c.telefono };
      setNegocio(n); try { localStorage.setItem("kp_negocio", JSON.stringify(n)); } catch { /* sin espacio */ }
    }).catch(() => {});
  }, []);
  const isDesktop = useIsDesktop();

  // Catálogo siempre fresco: al entrar, cada 2 minutos, al volver a la ventana y al
  // reconectar. Así la caja cobra con los precios que tiene el servidor.
  const [bloques, setBloques] = useState<Presentacion[]>(() => { try { return JSON.parse(localStorage.getItem("kp_bloques") || "[]"); } catch { return []; } });
  useEffect(() => {
    // Bloques: copia local para seguir vendiendo cajas sin internet.
    const cargarBloques = () => listarPresentaciones().then((l) => { setBloques(l); try { localStorage.setItem("kp_bloques", JSON.stringify(l)); } catch { /* sin espacio */ } }).catch(() => {});
    const cargar = () => { cargarBloques(); return listarProductos().then(setProductos).catch(() => { /* sin conexión: se queda el último */ }); };
    cargarBloques();
    listarProductos().then(setProductos).catch((e) => setErr((e as Error).message));
    const id = setInterval(cargar, 2 * 60 * 1000);
    const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
    window.addEventListener("online", cargar);
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(id); window.removeEventListener("online", cargar); document.removeEventListener("visibilitychange", alVolver); };
  }, []);
  // Si cambió un precio mientras había productos en el ticket, el ticket se actualiza.
  useEffect(() => {
    setCarrito((c) => {
      let cambio = false;
      const n = new Map(c);
      for (const [id, it] of c) {
        if (it.bloque && it.base) {
          const p = productos.find((x) => x.id === it.base!.id);
          const b = bloques.find((x) => x.id === it.bloque!.id) || it.bloque;
          if (p) { const v = comoProducto(p, b); if (v.precioUsd !== it.producto.precioUsd || v.stockActual !== it.producto.stockActual) { n.set(id, { ...it, producto: v, base: p, bloque: b }); cambio = true; } }
          continue;
        }
        const p = productos.find((x) => x.id === id);
        if (p && (p.precioUsd !== it.producto.precioUsd || p.stockActual !== it.producto.stockActual)) { n.set(id, { ...it, producto: p }); cambio = true; }
      }
      return cambio ? n : c;
    });
  }, [productos, bloques]);

  const cats = useMemo(() => {
    const map = new Map<string, number>();
    productos.forEach((p) => map.set(p.categoria, (map.get(p.categoria) || 0) + 1));
    return [...map.entries()];
  }, [productos]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return productos.filter((p) =>
      (cat === "all" || p.categoria === cat) &&
      (!t || p.nombre.toLowerCase().includes(t) || p.codigoBarras.includes(t)));
  }, [productos, q, cat]);

  const total = useMemo(() => r2([...carrito.values()].reduce((s, i) => s + i.producto.precioUsd * i.qty, 0)), [carrito]);
  const totalBs = r2(total * tasa);
  const unidades = [...carrito.values()].reduce((s, i) => s + (i.producto.esPesable ? 1 : i.qty), 0);

  // Por peso o medida (kg, litro, metro): se pregunta cuánto y se calcula el precio.
  const [pesar, setPesar] = useState<{ p: Producto; inicial?: number } | null>(null);
  const fijar = (p: Producto, qty: number) => {
    const c = new Map(carrito);
    if (qty <= 0) c.delete(p.id); else c.set(p.id, { producto: p, qty });
    setCarrito(c);
  };
  const [elegirBloque, setElegirBloque] = useState<Producto | null>(null);
  const bloquesDe = (id: number) => bloques.filter((b) => b.productoId === id);
  const addBloque = (p: Producto, b: Presentacion) => {
    const c = new Map(carrito); const it = c.get(-b.id);
    c.set(-b.id, { producto: comoProducto(p, b), base: p, bloque: b, qty: (it?.qty ?? 0) + 1 }); setCarrito(c);
  };
  /** Tocar un producto: si tiene bloques, se pregunta si va suelto o en caja/media caja. */
  const tocar = (p: Producto) => { if (bloquesDe(p.id).length > 0) setElegirBloque(p); else add(p); };
  const add = (p: Producto) => {
    if (p.esPesable) { setPesar({ p, inicial: carrito.get(p.id)?.qty }); return; }
    const c = new Map(carrito); const it = c.get(p.id);
    c.set(p.id, { producto: p, qty: (it?.qty ?? 0) + 1 }); setCarrito(c);
  };
  const paso = (id: number, d: number) => {
    const c = new Map(carrito); const it = c.get(id); if (!it) return;
    if (it.producto.esPesable) { if (d < 0) { c.delete(id); setCarrito(c); } else setPesar({ p: it.producto, inicial: it.qty }); return; }
    const q2 = it.qty + d; if (q2 <= 0) c.delete(id); else c.set(id, { ...it, qty: q2 }); setCarrito(c);
  };

  const vaciar = () => setCarrito(new Map());

  // Con el servicio suspendido la caja queda en solo consulta: no cobra (CLAUDE.md §3).
  const abrirCobro = () => {
    if (planSuspendido()) { setErr("Servicio suspendido: no se puede cobrar hasta pagar la mensualidad de KioskPOS."); return; }
    setErr(""); setView("checkout");
  };

  // ---------- Teclado (como el POS de escritorio) ----------
  // Escribir en cualquier lado busca (sirve con lector de código de barras), Enter agrega,
  // ↑↓ eligen, +/− cambian la cantidad del último, Supr lo quita, F9 o Ctrl+Enter cobra.
  const ultimo = () => { const ks = [...carrito.keys()]; return ks.length ? ks[ks.length - 1] : null; };
  const agregarDesdeBusqueda = () => {
    const t = q.trim();
    // El código de barras de una caja la agrega directo como caja.
    const bq = t ? bloques.find((b) => b.codigoBarras === t) : undefined;
    const base = bq && productos.find((p) => p.id === bq.productoId);
    if (bq && base) { if (base.stockActual >= bq.cantidad) addBloque(base, bq); setQ(""); setSelIdx(0); return; }
    const exacto = t ? productos.find((p) => p.codigoBarras === t) : undefined;
    const p = exacto || filtrados[Math.min(selIdx, filtrados.length - 1)];
    if (p && p.stockActual > 0) { if (exacto) add(p); else tocar(p); setQ(""); setSelIdx(0); }
  };
  useEffect(() => { setSelIdx(0); }, [q, cat]);
  useEffect(() => {
    if (view !== "caja" && view !== "ticket") return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const escribiendo = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      const enBuscar = el === buscarRef.current;
      if (document.querySelector(".modal, .overlay, .atajos")) return;
      if (e.key === "F9" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault(); if (carrito.size > 0) abrirCobro(); return;
      }
      if (e.key === "F2") { e.preventDefault(); buscarRef.current?.focus(); buscarRef.current?.select(); return; }
      if (e.key === "F4") { e.preventDefault(); if (!planSuspendido()) setRecargas(true); return; }
      if (escribiendo && !enBuscar) return;
      const sinTexto = !enBuscar || q === "";
      if ((e.key === "+" || e.key === "-") && sinTexto && !e.ctrlKey && !e.metaKey) {
        const id = ultimo(); if (id != null) { e.preventDefault(); paso(id, e.key === "+" ? 1 : -1); } return;
      }
      if (e.key === "Delete" && sinTexto) { const id = ultimo(); if (id != null) { e.preventDefault(); const c = new Map(carrito); c.delete(id); setCarrito(c); } return; }
      if (!escribiendo && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); setQ((x) => x + e.key); buscarRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  // Venta terminada: Enter empieza la siguiente.
  useEffect(() => {
    if (view !== "done") return;
    const h = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); nuevaVenta(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
  // En PC el buscador arranca con el cursor puesto.
  useEffect(() => { if (view === "caja" && window.matchMedia("(min-width:1024px)").matches) buscarRef.current?.focus(); }, [view]);

  const confirmar = async (pagos: PagoCobro[], resumen: ResumenPago, clienteId?: number | null) => {
    try {
      // Se manda también el precio con que se cobró: si la venta se queda en la cola sin
      // internet y el catálogo cambia mientras tanto, el servidor respeta lo que se cobró.
      const its = [...carrito.values()].map((i) => i.bloque && i.base
        ? { productoId: i.base.id, presentacionId: i.bloque.id, cantidad: i.qty, precioUsd: i.producto.precioUsd }
        : { productoId: i.producto.id, cantidad: i.qty, precioUsd: i.producto.precioUsd });
      const codigo = await cobrar(its, pagos, clienteId, { totalUsd: total, productos: [...carrito.values()].map((i) => i.producto.nombre).join(", ").slice(0, 120) });
      window.dispatchEvent(new Event("kp-turno"));
      setDone({ total, totalBs, payLine: resumen.payLine, change: resumen.change, changeNote: resumen.changeNote, receipt: recibo(pagos, resumen, facturaDe(codigo)), factura: facturaDe(codigo), credito: resumen.credito });
      setView("done");
    } catch (e) { setErr((e as Error).message); }
  };

  const NOMBRE_PAGO: Record<string, string> = { FIADO: "CREDITO" };
  const recibo = (pagos: PagoCobro[], resumen: ResumenPago, factura?: number) => armarTicket({
    negocio, fecha: new Date(), numero: factura ?? null, cliente: resumen.credito?.nombre ?? null, tasa,
    lineas: [...carrito.values()].map((i) => ({ cantidad: i.qty, nombre: i.producto.nombre, precioUsd: i.producto.precioUsd, subtotalUsd: r2(i.producto.precioUsd * i.qty) })),
    totalBs, vueltoUsd: resumen.vueltoUsd, vueltoBs: resumen.vueltoBs,
    pagos: pagos.map((p) => ({ nombre: p.metodo === "OTRO" && p.referencia ? p.referencia.toUpperCase() : NOMBRE_PAGO[p.metodo] || p.metodo,
      moneda: p.moneda, monto: p.montoOriginal, ref: p.metodo === "PAGO_MOVIL" ? p.referencia : undefined })),
  });

  const imprimir = async () => {
    if (!done) return;
    if (!(await conectorDisponible())) { setErr("El Conector de impresión no está abierto en esta PC."); return; }
    try { await imprimirTicket(done.receipt, true); } catch (e) { setErr((e as Error).message); }
  };

  const nuevaVenta = () => { setCarrito(new Map()); setDone(null); setErr(""); setView("caja"); listarProductos().then(setProductos).catch(() => {}); };
  // Atrás del teléfono: en el cobro vuelve al ticket; con la venta ya cobrada arranca una nueva
  // (nunca deja el carrito ya cobrado para cobrarlo otra vez).
  useAtras(view === "checkout" || view === "done", () => { if (view === "done") nuevaVenta(); else setView(isDesktop ? "caja" : "ticket"); });

  // ----- LISTO -----
  if (view === "done" && done) {
    return (
      <div className="view">
        <div className="co-head">
          <span style={{ width: 70 }} />
          <div className="steps">
            <span className="s done"><i><UIcono k="check" sw={3} /></i></span><span className="bar" />
            <span className="s done"><i><UIcono k="check" sw={3} /></i></span><span className="bar" />
            <span className="s now"><i>3</i></span>
          </div>
          <span style={{ width: 70 }} />
        </div>
        <div className="done">
          <div className="done-top">
            <div className="tick"><UIcono k="check" sw={2.6} /></div>
            <h2>Venta cobrada</h2>
            <p className="t">{usd(done.total)} · {done.payLine}</p>
            {done.factura != null
              ? <div className="fac-num" aria-label="Número de factura"><small>Factura N°</small><b className="t">{numFactura(done.factura)}</b></div>
              : <div className="fac-num pend"><small>Factura</small><b>Se numera al enviarse (sin internet)</b></div>}
            {done.credito && <p className="fac-cred">Anotado a crédito {done.credito.trabajador ? "del empleado" : "de"} <b>{done.credito.nombre}</b>: {usd(done.credito.montoUsd)}. Con el N° de factura el dueño ve todo lo que se llevó.</p>}
            {done.change && <div className="change">Vuelto: {done.change}{done.changeNote && <small>{done.changeNote}</small>}</div>}
          </div>
          <div className="receipt-lbl">Así sale el ticket (40 columnas)</div>
          <div className="receipt"><pre className="t">{done.receipt}</pre></div>
          {err && <p className="pinmsg err">{err}</p>}
          <div className="done-acts">
            <button className="btn2 press" onClick={imprimir}><UIcono k="print" />Imprimir</button>
            <button className="cta center press" onClick={nuevaVenta}>Nueva venta <kbd className="kb">Enter</kbd></button>
          </div>
        </div>
      </div>
    );
  }

  // ----- COBRO (pago dividido, pantalla 02 / 06-07) -----
  if (view === "checkout") {
    return (
      <Cobro total={total} tasa={tasa} isDesktop={isDesktop} err={err}
        onBack={() => setView(isDesktop ? "caja" : "ticket")}
        onConfirm={confirmar} />
    );
  }

  // ----- CAJA + ticket -----
  const items = [...carrito.values()];

  const searchrow = (
    <div className="searchrow">
      <div className="search"><UIcono k="search" /><input ref={buscarRef} placeholder="Buscar producto o código…  (F2)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); agregarDesdeBusqueda(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setSelIdx((i) => Math.min(i + 1, Math.max(0, filtrados.length - 1))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSelIdx((i) => Math.max(0, i - 1)); }
          else if (e.key === "Escape") { e.preventDefault(); setQ(""); }
        }} /></div>
      <button className="btn2 press rec-btn" onClick={() => setRecargas(true)} disabled={planSuspendido()} title="Recarga de saldo (F4)"><UIcono k="phone" sw={1.9} /><span>Recarga</span> <kbd className="kb">F4</kbd></button>
      {recargas && <Recargas onClose={() => setRecargas(false)} />}
    </div>
  );
  const chips = (
    <div className="cats">
      <button className="cat press" aria-pressed={cat === "all"} onClick={() => setCat("all")}>Todo <span className="t">{productos.length}</span></button>
      {cats.map(([c, n]) => {
        const info = catInfo(c);
        return <button key={c} className="cat press" style={info.cat ? ({ ["--c" as string]: `var(--c-${info.cat})` }) : undefined} aria-pressed={cat === c} onClick={() => setCat(c)}>{info.cat && <i />}{c} <span className="t">{n}</span></button>;
      })}
    </div>
  );

  // tarjeta de producto (escritorio, pantalla 01)
  const tarjeta = (p: Producto) => {
    const info = catInfo(p.categoria); const qn = carrito.get(p.id)?.qty ?? 0; const out = p.stockActual <= 0;
    return (
      <button key={p.id} className={"pcard press" + (qn > 0 ? " in-ticket" : "") + (out ? " soldout" : "") + (q && filtrados[selIdx]?.id === p.id ? " kbsel" : "")} style={{ ["--c" as string]: info.cat ? `var(--c-${info.cat})` : "var(--text-3)" }} onClick={() => tocar(p)} disabled={out}>
        <div className="pc-top"><span className="tile"><Icono k={info.icon} /></span>{qn > 0 && <span className="pc-badge t">×{qn}</span>}</div>
        <div className="pc-name">{p.nombre}{bloquesDe(p.id).length > 0 && <> <span className="blq-tag">+ {bloquesDe(p.id).map((b) => b.nombre).join(" / ")}</span></>}</div>
        <div className="pc-price"><strong className="t">{usd(p.precioUsd)}</strong>{out ? <span className="pill danger">Agotado</span> : <span className="bs t">{bs(r2(p.precioUsd * tasa))}</span>}</div>
      </button>
    );
  };

  // fila de producto (teléfono, pantalla 05)
  const fila = (p: Producto) => {
    const info = catInfo(p.categoria); const qn = carrito.get(p.id)?.qty ?? 0; const out = p.stockActual <= 0;
    return (
      <button key={p.id} className={"prod press" + (out ? " out" : "") + (q && filtrados[selIdx]?.id === p.id ? " kbsel" : "")} style={{ ["--c" as string]: info.cat ? `var(--c-${info.cat})` : "var(--text-3)" }} onClick={() => tocar(p)} disabled={out}>
        <span className="pi"><Icono k={info.icon} />{qn > 0 && <span className="badge t">{qn}</span>}</span>
        <span className="pn">{p.nombre}{bloquesDe(p.id).length > 0 && <> <span className="blq-tag">+ {bloquesDe(p.id)[0].nombre}</span></>}</span>
        <span className="pp t"><b>{usd(p.precioUsd)}</b><small>{out ? "Agotado" : bs(r2(p.precioUsd * tasa))}</small></span>
      </button>
    );
  };

  // líneas del ticket (reutilizadas en panel y hoja)
  const lineaTicket = (i: Item, variante: "panel" | "sheet") => {
    const info = catInfo(i.producto.categoria);
    if (variante === "panel") {
      return (
        <div className="tkp-ln" key={i.producto.id}>
          <span className="pi" style={{ ["--c" as string]: info.cat ? `var(--c-${info.cat})` : "var(--text-3)" }}><Icono k={info.icon} /></span>
          <div className="tkp-txt"><b>{i.producto.nombre}</b><span className="t">{cantTxt(i.producto, i.qty)} × {usd(i.producto.precioUsd)}</span></div>
          <div className="tkp-r"><strong className="t">{usd(r2(i.producto.precioUsd * i.qty))}</strong>
            <div className="stp"><button onClick={() => paso(i.producto.id, -1)}>−</button><span className="t">{cantTxt(i.producto, i.qty)}</span><button onClick={() => paso(i.producto.id, 1)}>+</button></div>
          </div>
        </div>
      );
    }
    return (
      <div className="ln" key={i.producto.id}>
        <span className="pi sm" style={{ ["--c" as string]: info.cat ? `var(--c-${info.cat})` : "var(--text-3)" }}><Icono k={info.icon} /></span>
        <div style={{ minWidth: 0 }}><div className="ln-n">{i.producto.nombre}</div><div className="ln-s t">{cantTxt(i.producto, i.qty)} × {usd(i.producto.precioUsd)}</div></div>
        <div className="ln-r"><div className="ln-a t">{usd(r2(i.producto.precioUsd * i.qty))}</div>
          <div className="stp"><button onClick={() => paso(i.producto.id, -1)}>−</button><span className="t">{cantTxt(i.producto, i.qty)}</span><button onClick={() => paso(i.producto.id, 1)}>+</button></div>
        </div>
      </div>
    );
  };

  const bloqueModal = elegirBloque && (
    <ElegirBloque producto={elegirBloque} bloques={bloquesDe(elegirBloque.id)} onClose={() => setElegirBloque(null)}
      onElegir={(b) => { const p = elegirBloque; setElegirBloque(null); if (b) addBloque(p, b); else add(p); }} />
  );
  const pesarModal = pesar && (
    <CantidadPesable producto={pesar.p} tasa={tasa} inicial={pesar.inicial} onClose={() => setPesar(null)}
      onOk={(cant) => { fijar(pesar.p, cant); setPesar(null); setQ(""); setSelIdx(0); }} />
  );

  // ----- ESCRITORIO / TABLET (pantalla 01): catálogo en tarjetas + ticket fijo -----
  if (isDesktop) {
    return (
      <div className="caja-wrap">
        {pesarModal}{bloqueModal}
        <div className="caja desk">
          {searchrow}
          {chips}
          <div className="pgrid">
            {err && <p className="noresult">{err}</p>}
            {filtrados.map(tarjeta)}
            {filtrados.length === 0 && !err && (
              <div className="cat-empty">
                <span className="ce-ic"><UIcono k="box" sw={1.6} /></span>
                <b>{q ? "Sin resultados" : "Aún no hay productos"}</b>
                <p>{q ? "Nada coincide con tu búsqueda." : "El dueño los carga en Productos, o importa un CSV."}</p>
              </div>
            )}
          </div>
        </div>
        <aside className="tkpanel">
          <div className="tkp-head">
            <div><h2>Venta actual</h2><div className="sub t">{unidades} {unidades === 1 ? "artículo" : "artículos"}</div></div>
            {unidades > 0 && <button className="link" onClick={vaciar}>Vaciar</button>}
          </div>
          {items.length === 0
            ? <div className="tkp-empty">Toca un producto para empezar la venta.</div>
            : (
              <>
                <div className="tkp-lines">{items.map((i) => lineaTicket(i, "panel"))}</div>
                <div className="tkp-foot">
                  <div className="tkp-sub"><span>Subtotal</span><span className="t">{usd(total)}</span></div>
                  <div className="tkp-sub"><span>En bolívares · BCV {tasa}</span><span className="t">{bs(totalBs)}</span></div>
                  <div className="tkp-total"><span>Total</span><b className="t">{usd(total)}</b></div>
                  <button className="btn primary big press" onClick={abrirCobro}>Cobrar {usd(total)} <kbd className="kb">F9</kbd></button>
                </div>
              </>
            )}
        </aside>
      </div>
    );
  }

  // ----- TELÉFONO (pantalla 05): lista + barra flotante + hoja -----
  return (
    <div className="caja">
      {pesarModal}{bloqueModal}
      {searchrow}
      {chips}
      <div className="prods">
        {err && <p className="noresult">{err}</p>}
        {filtrados.map(fila)}
        {filtrados.length === 0 && !err && <p className="noresult">Sin productos. Cárgalos en Inventario.</p>}
      </div>

      {unidades > 0 && (
        <div className="peek">
          <button className="peek-info press" onClick={() => setView("ticket")}>
            <span className="peek-n t">{unidades}</span>
            <span className="peek-txt"><b className="t">{usd(total)}</b><small className="t">{bs(totalBs)} · ver</small></span>
          </button>
          <button className="cta accent center press" style={{ width: "auto", height: 52, padding: "0 22px" }} onClick={abrirCobro}>Cobrar</button>
        </div>
      )}

      {view === "ticket" && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setView("caja"); }}>
          <div className="sheet">
            <div className="grab" />
            <div className="tk-head"><div><h2>Ticket</h2><div className="sub t">{unidades} {unidades === 1 ? "artículo" : "artículos"}</div></div><button className="ghost" onClick={() => setView("caja")}>Seguir vendiendo</button></div>
            <div className="tk-lines">{items.map((i) => lineaTicket(i, "sheet"))}</div>
            <div className="tk-foot">
              <div className="tk-row"><span>En bolívares (BCV {tasa})</span><span className="t">{bs(totalBs)}</span></div>
              <div className="tk-total"><span>Total</span><b className="t">{usd(total)}</b></div>
              <button className="cta press" style={{ marginTop: 4 }} onClick={abrirCobro}><span>Cobrar</span><span className="amt t">{usd(total)}</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
