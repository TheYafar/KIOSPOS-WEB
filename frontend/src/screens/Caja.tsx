import { useEffect, useMemo, useState } from "react";
import { cobrar, getTasa, listarProductos, type PagoCobro, type Producto } from "../api";
import { conectorDisponible, imprimirTicket } from "../conector";
import { Icono, UIcono, catInfo } from "../icons";

type Metodo = "usd" | "ves" | "pm" | "punto" | "bio" | "mix";
interface Item { producto: Producto; qty: number; }

const METODOS: { id: Metodo; n: string; s: string; i: string }[] = [
  { id: "usd", n: "Efectivo $", s: "Dólares", i: "cash" },
  { id: "ves", n: "Efectivo Bs", s: "Bolívares", i: "bills" },
  { id: "pm", n: "Pago móvil", s: "Bolívares", i: "phone" },
  { id: "punto", n: "Punto", s: "Débito", i: "card" },
  { id: "bio", n: "Biopago", s: "Huella", i: "finger" },
  { id: "mix", n: "Mixto", s: "$ + pago móvil", i: "mix" }
];

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const numOf = (s: string) => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0 : 0);

interface Done { total: number; totalBs: number; payLine: string; change: string; changeNote: string; receipt: string; }

export function Caja() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [carrito, setCarrito] = useState<Map<number, Item>>(new Map());
  const [view, setView] = useState<"caja" | "ticket" | "checkout" | "done">("caja");
  const [m, setM] = useState<Metodo>("usd");
  const [recv, setRecv] = useState("");
  const [ref, setRef] = useState("");
  const [cash, setCash] = useState("");
  const [target, setTarget] = useState<"recv" | "cash" | "ref">("recv");
  const [done, setDone] = useState<Done | null>(null);
  const [err, setErr] = useState("");

  const tasa = Number(getTasa()) || 1;

  useEffect(() => { listarProductos().then(setProductos).catch((e) => setErr((e as Error).message)); }, []);

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
  const unidades = [...carrito.values()].reduce((s, i) => s + i.qty, 0);

  const add = (p: Producto) => {
    const c = new Map(carrito); const it = c.get(p.id);
    c.set(p.id, { producto: p, qty: (it?.qty ?? 0) + 1 }); setCarrito(c);
  };
  const paso = (id: number, d: number) => {
    const c = new Map(carrito); const it = c.get(id); if (!it) return;
    const q2 = it.qty + d; if (q2 <= 0) c.delete(id); else c.set(id, { ...it, qty: q2 }); setCarrito(c);
  };

  const abrirCobro = () => { setM("usd"); setRecv(""); setRef(""); setCash(""); setTarget("recv"); setErr(""); setView("checkout"); };

  const coValid = () => {
    if (m === "usd") return numOf(recv) >= total - 0.001;
    if (m === "ves") return numOf(recv) >= totalBs - 0.001;
    if (m === "pm") return ref.length >= 4;
    if (m === "mix") return ref.length >= 4 && numOf(cash) <= total;
    return true;
  };

  const tecla = (k: string) => {
    const key = m === "pm" ? "ref" : target;
    const cur = key === "ref" ? ref : key === "cash" ? cash : recv;
    let s = cur;
    if (k === "del") s = s.slice(0, -1);
    else if (k === "clr") s = "";
    else if (k === ",") { if (key !== "ref" && s.indexOf(",") < 0) s = (s || "0") + ","; }
    else if (key === "ref") { if (s.length < 6) s += k; }
    else { const dec = s.indexOf(","); if (dec >= 0 && s.length - dec > 2) return; if (s.replace(/\D/g, "").length < 9) s = (s === "0" ? "" : s) + k; }
    if (key === "ref") setRef(s); else if (key === "cash") setCash(s); else setRecv(s);
  };

  const splitChange = (v: number) => { const u = Math.floor(v + 1e-9); return { usd: u, bs: r2((v - u) * tasa) }; };

  const confirmar = async () => {
    if (!coValid()) return;
    let pagos: PagoCobro[] = [];
    let payLine = "", change = "", changeNote = "";
    if (m === "usd") {
      const g = numOf(recv); pagos = [{ metodo: "EFECTIVO_USD", moneda: "USD", montoOriginal: g }];
      payLine = "Efectivo $ · recibido " + usd(g);
      const v = r2(g - total); if (v > 0) { const sp = splitChange(v); change = (sp.usd ? usd(sp.usd) : "") + (sp.usd && sp.bs ? " + " : "") + (sp.bs ? bs(sp.bs) : ""); if (sp.usd && sp.bs) changeNote = "Los centavos van en bolívares"; }
    } else if (m === "ves") {
      const g = numOf(recv); pagos = [{ metodo: "EFECTIVO_BS", moneda: "VES", montoOriginal: g }];
      payLine = "Efectivo Bs · recibido " + bs(g); const v = r2(g - totalBs); if (v > 0) change = bs(v);
    } else if (m === "pm") {
      pagos = [{ metodo: "PAGO_MOVIL", moneda: "VES", montoOriginal: totalBs, referencia: ref }]; payLine = "Pago móvil · ref. " + ref;
    } else if (m === "punto") {
      pagos = [{ metodo: "PUNTO", moneda: "VES", montoOriginal: totalBs }]; payLine = "Punto de venta · " + bs(totalBs);
    } else if (m === "bio") {
      pagos = [{ metodo: "BIOPAGO", moneda: "VES", montoOriginal: totalBs }]; payLine = "Biopago · " + bs(totalBs);
    } else {
      const cashUsd = r2(Math.min(numOf(cash), total)); const restBs = r2((total - cashUsd) * tasa);
      pagos = [{ metodo: "EFECTIVO_USD", moneda: "USD", montoOriginal: cashUsd }, { metodo: "PAGO_MOVIL", moneda: "VES", montoOriginal: restBs, referencia: ref }];
      payLine = usd(cashUsd) + " efectivo + pago móvil ref. " + ref;
    }
    try {
      const items = [...carrito.values()].map((i) => ({ productoId: i.producto.id, cantidad: i.qty }));
      await cobrar(items, pagos);
      setDone({ total, totalBs, payLine, change, changeNote, receipt: recibo(payLine, change) });
      setView("done");
    } catch (e) { setErr((e as Error).message); }
  };

  const recibo = (payLine: string, change: string) => {
    const w = 40, pad = (l: string, r: string) => l.length + r.length >= w ? (l + " " + r).slice(0, w) : l + " ".repeat(w - l.length - r.length) + r;
    const center = (s: string) => " ".repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s;
    const now = new Date();
    const dt = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ` + now.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" });
    const L = [center("BODEGA COCOA"), center("Valencia"), dt, "-".repeat(w)];
    [...carrito.values()].forEach((i) => { L.push(i.producto.nombre.slice(0, w)); L.push(pad("  " + i.qty + " x " + money(i.producto.precioUsd), usd(r2(i.producto.precioUsd * i.qty)))); });
    L.push("-".repeat(w), pad("TOTAL", usd(total)), pad("En Bs (BCV " + tasa + ")", bs(totalBs)), payLine.slice(0, w));
    if (change) L.push(pad("Vuelto", change));
    L.push("-".repeat(w), center("Gracias por su compra"));
    return L.join("\n");
  };

  const imprimir = async () => {
    if (!done) return;
    if (!(await conectorDisponible())) { setErr("El Conector de impresión no está abierto en esta PC."); return; }
    try { await imprimirTicket(done.receipt, true); } catch (e) { setErr((e as Error).message); }
  };

  const nuevaVenta = () => { setCarrito(new Map()); setDone(null); setErr(""); setView("caja"); listarProductos().then(setProductos).catch(() => {}); };

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
            {done.change && <div className="change">Vuelto: {done.change}{done.changeNote && <small>{done.changeNote}</small>}</div>}
          </div>
          <div className="receipt-lbl">Así sale el ticket (40 columnas)</div>
          <div className="receipt"><pre className="t">{done.receipt}</pre></div>
          {err && <p className="pinmsg err">{err}</p>}
          <div className="done-acts">
            <button className="btn2 press" onClick={imprimir}><UIcono k="print" />Imprimir</button>
            <button className="cta center press" onClick={nuevaVenta}>Nueva venta</button>
          </div>
        </div>
      </div>
    );
  }

  // ----- COBRO -----
  if (view === "checkout") {
    const quickUSD = () => { const out = [{ v: total, l: "Exacto" }]; [1, 2, 5, 10, 20, 50].forEach((v) => { if (v > total && out.length < 5) out.push({ v, l: "$" + v }); }); return out; };
    const quickVES = () => { const out = [{ v: totalBs, l: "Exacto" }]; const seen: Record<number, boolean> = {}; [100, 1000, 5000, 10000].forEach((s) => { const v = Math.ceil(totalBs / s) * s; if (v > totalBs && !seen[v] && out.length < 5) { seen[v] = true; out.push({ v, l: "Bs " + v }); } }); return out; };
    const numeric = m === "usd" || m === "ves" || m === "pm" || m === "mix";
    const padKind = (m === "pm" || (m === "mix" && target === "ref")) ? "ref" : "num";

    return (
      <div className="view">
        <div className="co-head">
          <button className="back press" onClick={() => setView("ticket")}><UIcono k="back" sw={2} />Ticket</button>
          <div className="steps">
            <span className="s done"><i><UIcono k="check" sw={3} /></i></span><span className="bar" />
            <span className="s now"><i>2</i></span><span className="bar" />
            <span className="s"><i>3</i></span>
          </div>
          <div className="co-tot"><b className="t">{usd(total)}</b><small className="t">{bs(totalBs)}</small></div>
        </div>
        <div className="co-body">
          <div className="big-total"><b className="t">{usd(total)}</b><span className="t"> {bs(totalBs)} · {unidades} {unidades === 1 ? "artículo" : "artículos"}</span></div>
          <h3 className="h3">¿Cómo paga el cliente?</h3>
          <div className="mcards">
            {METODOS.map((x) => (
              <button key={x.id} className="mc press" aria-pressed={m === x.id} onClick={() => { setM(x.id); setTarget(x.id === "mix" ? "cash" : "recv"); }}>
                <UIcono k={x.i} /><span><b>{x.n}</b><small>{x.s}</small></span>
                <span className="ok-tick"><UIcono k="check" sw={3} /></span>
              </button>
            ))}
          </div>

          {(m === "usd" || m === "ves") && (() => {
            const isU = m === "usd"; const tt = isU ? total : totalBs; const got = numOf(recv);
            const shown = recv ? (isU ? "$ " : "Bs ") + recv : "";
            return (
              <div className="amtpanel">
                <h3 className="h3">¿Con cuánto paga?</h3>
                <div className="field" aria-pressed="true"><span>Recibido</span><b className={"t" + (shown ? "" : " ph")}>{shown || (isU ? "$ 0" : "Bs 0")}<span className="caret" /></b></div>
                <div className="bills">{(isU ? quickUSD() : quickVES()).map((x) => (
                  <button key={x.l} className="bill press t" aria-pressed={!!recv && Math.abs(got - x.v) < 0.005} onClick={() => setRecv(String(x.v).replace(".", ","))}>{x.l}</button>
                ))}</div>
                {!recv ? <div className="banner idle"><span>Toca un billete o escribe cuánto te dio</span></div>
                  : got < tt - 0.001 ? <div className="banner warn"><span>Faltan</span><span><b className="t">{isU ? usd(r2(tt - got)) : bs(r2(tt - got))}</b></span></div>
                    : <div className="banner ok"><span>{got - tt > 0.001 ? "Vuelto" : "Pago exacto"}</span><span><b className="t">{isU ? usd(r2(got - tt)) : bs(r2(got - tt))}</b></span></div>}
              </div>
            );
          })()}

          {(m === "pm" || m === "mix") && (() => {
            const cashUsd = m === "mix" ? Math.min(numOf(cash), total) : 0; const restBs = r2((total - cashUsd) * tasa);
            return (
              <div className="amtpanel">
                <h3 className="h3">{m === "mix" ? "Efectivo + pago móvil" : "Datos del pago móvil"}</h3>
                <div className="card"><dl className="kv"><dt>Monto a transferir</dt><dd className="t" style={{ fontWeight: 600 }}>{bs(restBs)}</dd><dt>Banco</dt><dd>Banesco (0134)</dd><dt>Teléfono</dt><dd className="t">0412-555-0142</dd></dl></div>
                <div className="fields">
                  {m === "mix" && <button className="field press" aria-pressed={target === "cash"} onClick={() => setTarget("cash")}><span>Parte en efectivo</span><b className={"t" + (cash ? "" : " ph")}>{cash ? "$ " + cash : "$ 0"}{target === "cash" && <span className="caret" />}</b></button>}
                  <button className="field press" aria-pressed={target === "ref"} onClick={() => setTarget("ref")}><span>Referencia del pago móvil</span><b className={"t" + (ref ? "" : " ph")}>{ref || "Últimos 6 dígitos"}{(target === "ref" || m === "pm") && <span className="caret" />}</b></button>
                </div>
                {ref.length >= 4 ? <div className="banner ok"><span>Referencia lista</span><span><b className="t">{ref}</b></span></div> : <div className="banner idle"><span>Escribe la referencia del cliente</span></div>}
              </div>
            );
          })()}

          {(m === "punto" || m === "bio") && (
            <div className="amtpanel">
              <h3 className="h3">{m === "bio" ? "Cobrar con Biopago" : "Cobrar con el punto"}</h3>
              <div className="card waiting"><span className="pulse"><UIcono k={m === "bio" ? "finger" : "card"} /></span>
                <div><div style={{ fontWeight: 600 }}>Marca <span className="t">{bs(totalBs)}</span></div><div className="muted">{m === "bio" ? "El cliente pone la huella. Cuando salga aprobado, confirma." : "Pásale la tarjeta. Cuando el punto diga aprobado, confirma."}</div></div>
              </div>
            </div>
          )}

          {numeric && (
            <div className="keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", padKind === "ref" ? "clr" : ",", "0", "del"].map((k) => (
                <button key={k} className={"key press" + (k === "clr" ? " fn" : "")} onClick={() => tecla(k)}>
                  {k === "del" ? <UIcono k="del" /> : k === "clr" ? "Borrar" : k}
                </button>
              ))}
            </div>
          )}
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="co-foot">
          <button className="cta center press" disabled={!coValid()} onClick={confirmar}>
            {m === "punto" || m === "bio" ? "Ya salió aprobado" : "Confirmar pago"}
          </button>
        </div>
      </div>
    );
  }

  // ----- CAJA + ticket -----
  return (
    <div className="caja">
      <div className="searchrow">
        <div className="search"><UIcono k="search" /><input placeholder="Buscar producto o código…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="cats">
        <button className="cat press" aria-pressed={cat === "all"} onClick={() => setCat("all")}>Todo <span className="t">{productos.length}</span></button>
        {cats.map(([c, n]) => {
          const info = catInfo(c);
          return <button key={c} className="cat press" style={info.cat ? ({ ["--c" as string]: `var(--c-${info.cat})` }) : undefined} aria-pressed={cat === c} onClick={() => setCat(c)}>{info.cat && <i />}{c} <span className="t">{n}</span></button>;
        })}
      </div>
      <div className="prods">
        {err && <p className="noresult">{err}</p>}
        {filtrados.map((p) => {
          const info = catInfo(p.categoria); const qn = carrito.get(p.id)?.qty ?? 0; const out = p.stockActual <= 0;
          return (
            <button key={p.id} className={"prod press" + (out ? " out" : "")} style={{ ["--c" as string]: info.cat ? `var(--c-${info.cat})` : "var(--text-3)" }} onClick={() => add(p)} disabled={out}>
              <span className="pi"><Icono k={info.icon} />{qn > 0 && <span className="badge t">{qn}</span>}</span>
              <span className="pn">{p.nombre}</span>
              <span className="pp t"><b>{usd(p.precioUsd)}</b><small>{out ? "Agotado" : bs(r2(p.precioUsd * tasa))}</small></span>
            </button>
          );
        })}
        {filtrados.length === 0 && !err && <p className="noresult">Sin productos. Cárgalos en Inventario.</p>}
      </div>

      {unidades > 0 && (
        <div className="peek">
          <button className="peek-info press" onClick={() => setView("ticket")}>
            <span className="peek-n t">{unidades}</span>
            <span className="peek-txt"><b className="t">{usd(total)}</b><small className="t">{bs(totalBs)} · ver</small></span>
          </button>
          <button className="cta center press" style={{ width: "auto", height: 52, padding: "0 22px" }} onClick={abrirCobro}>Cobrar</button>
        </div>
      )}

      {view === "ticket" && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setView("caja"); }}>
          <div className="sheet">
            <div className="grab" />
            <div className="tk-head"><div><h2>Ticket</h2><div className="sub t">{unidades} {unidades === 1 ? "artículo" : "artículos"}</div></div><button className="ghost" onClick={() => setView("caja")}>Seguir vendiendo</button></div>
            <div className="tk-lines">
              {[...carrito.values()].map((i) => {
                const info = catInfo(i.producto.categoria);
                return (
                  <div className="ln" key={i.producto.id}>
                    <span className="pi sm" style={{ ["--c" as string]: info.cat ? `var(--c-${info.cat})` : "var(--text-3)" }}><Icono k={info.icon} /></span>
                    <div style={{ minWidth: 0 }}><div className="ln-n">{i.producto.nombre}</div><div className="ln-s t">{i.qty} × {usd(i.producto.precioUsd)}</div></div>
                    <div className="ln-r"><div className="ln-a t">{usd(r2(i.producto.precioUsd * i.qty))}</div>
                      <div className="stp"><button onClick={() => paso(i.producto.id, -1)}>−</button><span className="t">{i.qty}</span><button onClick={() => paso(i.producto.id, 1)}>+</button></div>
                    </div>
                  </div>
                );
              })}
            </div>
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
