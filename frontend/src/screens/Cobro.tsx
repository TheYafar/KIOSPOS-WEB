import { useMemo, useState } from "react";
import { type PagoCobro } from "../api";
import { UIcono } from "../icons";

type MetodoId = "EFECTIVO_USD" | "EFECTIVO_BS" | "PAGO_MOVIL" | "PUNTO" | "BIOPAGO";
interface Forma { id: MetodoId; n: string; sub: string; moneda: "USD" | "VES"; icon: string; color: string; ref?: boolean; cash?: boolean; }

const FORMAS: Forma[] = [
  { id: "EFECTIVO_USD", n: "Efectivo $", sub: "Dólares", moneda: "USD", icon: "cash", color: "var(--primary)", cash: true },
  { id: "EFECTIVO_BS", n: "Efectivo Bs", sub: "Bolívares", moneda: "VES", icon: "bills", color: "var(--c-limpieza)", cash: true },
  { id: "PAGO_MOVIL", n: "Pago móvil", sub: "Bolívares", moneda: "VES", icon: "phone", color: "var(--c-bebidas)", ref: true },
  { id: "PUNTO", n: "Punto", sub: "Tarjeta", moneda: "VES", icon: "card", color: "var(--warn)" },
  { id: "BIOPAGO", n: "Biopago", sub: "Huella", moneda: "VES", icon: "finger", color: "var(--c-chucherias)" }
];
const forma = (id: MetodoId) => FORMAS.find((f) => f.id === id)!;

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const numOf = (s: string) => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0 : 0);
const aTexto = (n: number) => (n <= 0 ? "" : n.toFixed(2).replace(".", ","));

interface Linea { key: number; metodo: MetodoId; monto: string; ref: string; }
export interface ResumenPago { payLine: string; change: string; changeNote: string; }

let KEY = 1;

/** Cobro con pago dividido (pantalla 02 / 06-07). Reparte el total entre varias
 *  formas de pago; el vuelto solo sale del efectivo. El servidor re-valida. */
export function Cobro({ total, tasa, isDesktop, err, onBack, onConfirm }: {
  total: number; tasa: number; isDesktop: boolean; err: string;
  onBack: () => void;
  onConfirm: (pagos: PagoCobro[], resumen: ResumenPago) => void;
}) {
  const totalBs = r2(total * tasa);
  const [lineas, setLineas] = useState<Linea[]>([{ key: KEY++, metodo: "EFECTIVO_USD", monto: "", ref: "" }]);
  const [activa, setActiva] = useState<number | null>(lineas[0]?.key ?? null);
  const [campo, setCampo] = useState<"monto" | "ref">("monto");
  const [hoja, setHoja] = useState<number | null>(null); // teléfono: línea en edición

  const aporteUsd = (l: Linea) => { const v = numOf(l.monto); return forma(l.metodo).moneda === "USD" ? v : r2(v / tasa); };
  const cubierto = useMemo(() => r2(lineas.reduce((s, l) => s + aporteUsd(l), 0)), [lineas, tasa]);
  const falta = Math.max(0, r2(total - cubierto));
  const vuelto = Math.max(0, r2(cubierto - total));
  const listas = lineas.filter((l) => numOf(l.monto) > 0).length;

  const restoDe = (l: Linea) => { // cuánto falta si ignoramos esta línea, en SU moneda
    const otros = r2(lineas.reduce((s, x) => s + (x.key === l.key ? 0 : aporteUsd(x)), 0));
    const restoUsd = Math.max(0, r2(total - otros));
    return forma(l.metodo).moneda === "USD" ? restoUsd : r2(restoUsd * tasa);
  };

  const setMonto = (key: number, texto: string) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, monto: texto } : l)));
  const setRef = (key: number, texto: string) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ref: texto } : l)));

  const agregar = (id: MetodoId) => { const k = KEY++; setLineas((ls) => [...ls, { key: k, metodo: id, monto: "", ref: "" }]); setActiva(k); setCampo("monto"); if (!isDesktop) setHoja(k); };
  const quitar = (key: number) => { setLineas((ls) => ls.filter((l) => l.key !== key)); if (activa === key) setActiva(null); if (hoja === key) setHoja(null); };
  const ponerResto = (l: Linea) => setMonto(l.key, aTexto(restoDe(l)));

  const tecla = (k: string, key: number | null, cmp: "monto" | "ref") => {
    if (key == null) return;
    const l = lineas.find((x) => x.key === key); if (!l) return;
    if (cmp === "ref") { let s = l.ref; if (k === "del") s = s.slice(0, -1); else if (k === "clr") s = ""; else if (s.length < 6) s += k; setRef(key, s); return; }
    let s = l.monto;
    if (k === "del") s = s.slice(0, -1);
    else if (k === "clr") s = "";
    else if (k === ",") { if (s.indexOf(",") < 0) s = (s || "0") + ","; }
    else { const dec = s.indexOf(","); if (dec >= 0 && s.length - dec > 2) return; if (s.replace(/\D/g, "").length < 9) s = (s === "0" ? "" : s) + k; }
    setMonto(key, s);
  };

  const refOk = (l: Linea) => l.metodo !== "PAGO_MOVIL" || numOf(l.monto) <= 0 || l.ref.length >= 4;
  const valido = falta <= 0.001 && listas > 0 && lineas.every(refOk);

  const confirmar = () => {
    if (!valido) return;
    const pagos: PagoCobro[] = lineas.filter((l) => numOf(l.monto) > 0).map((l) => {
      const f = forma(l.metodo); const v = r2(numOf(l.monto));
      return { metodo: l.metodo, moneda: f.moneda, montoOriginal: v, ...(l.metodo === "PAGO_MOVIL" ? { referencia: l.ref } : {}) };
    });
    const payLine = lineas.filter((l) => numOf(l.monto) > 0).map((l) => {
      const f = forma(l.metodo); const v = numOf(l.monto);
      return f.n + " " + (f.moneda === "USD" ? usd(v) : bs(v)) + (l.metodo === "PAGO_MOVIL" ? " ref. " + l.ref : "");
    }).join(" + ");
    const change = vuelto > 0.001 ? usd(vuelto) : "";
    onConfirm(pagos, { payLine, change, changeNote: change ? "El vuelto sale del efectivo" : "" });
  };

  const disponibles = FORMAS.filter((f) => !lineas.some((l) => l.metodo === f.id));
  const colorStyle = (c: string) => ({ background: `color-mix(in srgb, ${c} 15%, var(--surface))`, color: c });

  // ----- cabecera (pasos) -----
  const head = (
    <div className="co-head">
      <button className="back press" onClick={onBack}><UIcono k="back" sw={2} />Ticket</button>
      <div className="steps">
        <span className="s done"><i><UIcono k="check" sw={3} /></i></span><span className="bar" />
        <span className="s now"><i>2</i></span><span className="bar" />
        <span className="s"><i>3</i></span>
      </div>
      <div className="co-tot"><b className="t">{usd(total)}</b><small className="t">{bs(totalBs)}</small></div>
    </div>
  );

  // ----- resumen (Total / Ya pagó / Falta / Vuelto) + barra -----
  const resumen = (
    <div className="co2-sum">
      <div className="co2-cells">
        <div className="co2-cell"><span className="k">Total</span><span className="v t">{usd(total)}</span><span className="s t">{bs(totalBs)}</span></div>
        <div className="co2-cell ok"><span className="k">Ya pagó</span><span className="v t">{usd(Math.min(cubierto, total))}</span><span className="s">{listas} {listas === 1 ? "forma" : "formas"} de pago</span></div>
        <div className={"co2-cell" + (falta > 0.001 ? " warn" : "")}><span className="k">Falta</span><span className="v t">{usd(falta)}</span><span className="s t">{bs(r2(falta * tasa))}</span></div>
        <div className="co2-cell"><span className="k">Vuelto</span><span className="v t">{usd(vuelto)}</span><span className="s">Solo del efectivo</span></div>
      </div>
      <div className="progress">
        {lineas.map((l) => { const w = total > 0 ? Math.min(100, (aporteUsd(l) / total) * 100) : 0; return w > 0 ? <i key={l.key} style={{ width: w + "%", background: forma(l.metodo).color }} /> : null; })}
      </div>
      <div className="legend">
        {lineas.filter((l) => aporteUsd(l) > 0).map((l) => (
          <span key={l.key}><i style={{ background: forma(l.metodo).color }} />{forma(l.metodo).n} {usd(aporteUsd(l))}</span>
        ))}
        {falta > 0.001 && <span><i style={{ background: "var(--warn)" }} />Falta {usd(falta)}</span>}
      </div>
    </div>
  );

  // ================= ESCRITORIO (pantalla 02) =================
  if (isDesktop) {
    const act = lineas.find((l) => l.key === activa) || null;
    return (
      <div className="view">
        {head}
        <div className="co2-body">
          <div className="co2-main">
            {resumen}
            <h3 className="h3">Reparte el pago — cada columna es una forma de pago</h3>
            <div className="co2-cols">
              {lineas.map((l) => {
                const f = forma(l.metodo); const ap = aporteUsd(l); const lista = ap > 0 && refOk(l);
                return (
                  <div key={l.key} className={"co2-col" + (activa === l.key ? " active" : "")} onClick={() => { setActiva(l.key); setCampo("monto"); }}>
                    <div className="co2-col-head">
                      <span className="co2-ic" style={colorStyle(f.color)}><UIcono k={f.icon} sw={1.8} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}><b>{f.n}</b><div className="sub">{f.sub}</div></div>
                      {lineas.length > 1 && <button className="co2-x press" onClick={(e) => { e.stopPropagation(); quitar(l.key); }}><UIcono k="close" sw={2} /></button>}
                    </div>
                    <div className={"co2-amt" + (activa === l.key && campo === "monto" ? " on" : "")} onClick={() => { setActiva(l.key); setCampo("monto"); }}>
                      <span className="k">Monto</span>
                      <span className="v t">{f.moneda === "USD" ? "$ " : "Bs "}{l.monto || "0"}{activa === l.key && campo === "monto" && <span className="caret" />}</span>
                      <span className="s t">{f.moneda === "USD" ? "= " + bs(r2(numOf(l.monto) * tasa)) : "= " + usd(r2(numOf(l.monto) / tasa))}</span>
                    </div>
                    {f.ref && (
                      <div className={"co2-reffield" + (activa === l.key && campo === "ref" ? " on" : "")} onClick={(e) => { e.stopPropagation(); setActiva(l.key); setCampo("ref"); }}>
                        <b className={l.ref ? "t" : "t3"}>{l.ref || "Referencia"}{activa === l.key && campo === "ref" && <span className="caret" />}</b>
                        {l.ref.length >= 4 && <span style={{ color: "var(--ok)" }}><UIcono k="check" sw={2} /></span>}
                      </div>
                    )}
                    <button className="co2-rest press" onClick={(e) => { e.stopPropagation(); setActiva(l.key); ponerResto(l); }}>
                      <b>Poner el resto aquí</b><span>{f.moneda === "USD" ? usd(restoDe(l)) : bs(restoDe(l))}</span>
                    </button>
                    <div style={{ flex: 1 }} />
                    {lista ? <span className="pill ok"><UIcono k="check" sw={2.5} />Listo</span> : <span className="pill warn">Faltan {usd(falta)}</span>}
                  </div>
                );
              })}
              {disponibles.length > 0 && (
                <div className="co2-col add">
                  <b>Agregar otra forma de pago</b>
                  <span className="t3" style={{ fontSize: 12, fontWeight: 500 }}>Toca una para repartir el pago.</span>
                  {disponibles.map((f) => (
                    <button key={f.id} className="co2-addbtn press" onClick={() => agregar(f.id)}><span style={{ color: f.color }}><UIcono k={f.icon} sw={1.8} /></span>{f.n}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="tip"><span style={{ color: "var(--warn)" }}><UIcono k="cash" /></span>
              <div><b style={{ fontSize: 13.5, fontWeight: 600 }}>El vuelto solo sale del efectivo</b>
                <div className="t2" style={{ fontSize: 12.5, fontWeight: 500 }}>Pago móvil, punto y Biopago se cobran exactos. Si el cliente da de más en efectivo, el sistema calcula el vuelto.</div></div>
            </div>
          </div>

          <aside className="co2-side">
            <div className="row-between"><b className="t3" style={{ fontSize: 13 }}>Escribiendo en</b>
              {act && <span className="pill brand"><UIcono k={forma(act.metodo).icon} sw={2} />{forma(act.metodo).n}</span>}</div>
            <div className="keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", campo === "ref" ? "clr" : ",", "0", "del"].map((k) => (
                <button key={k} className={"key press" + (k === "clr" ? " fn" : "")} onClick={() => tecla(k, activa, campo)}>
                  {k === "del" ? <UIcono k="del" /> : k === "clr" ? "Borrar" : k}
                </button>
              ))}
            </div>
            <div className="co2-keys">
              <button className="co2-scut acc press" onClick={() => act && (setCampo("monto"), ponerResto(act))}>Todo el resto</button>
              <button className="co2-scut press" onClick={() => act && setMonto(act.key, "")}>Borrar monto</button>
            </div>
            <div style={{ flex: 1 }} />
            {err && <p className="pinmsg err">{err}</p>}
            {valido
              ? <button className="btn primary big press" onClick={confirmar}>Confirmar pago · {usd(total)}</button>
              : <div className="disabled-btn">Faltan {usd(falta)} para confirmar</div>}
            <span className="t3 med" style={{ fontSize: 12, textAlign: "center" }}>Se activa cuando las formas cubren el total.</span>
          </aside>
        </div>
      </div>
    );
  }

  // ================= TELÉFONO (pantallas 06 / 07) =================
  const act = hoja != null ? lineas.find((l) => l.key === hoja) || null : null;
  return (
    <div className="view">
      <div className="co-head">
        <button className="back press" onClick={onBack}><UIcono k="back" sw={2} /></button>
        <div className="steps"><b style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Cobrar</b></div>
        <div className="co-tot"><b className="t">{usd(total)}</b><small className="t">{bs(totalBs)}</small></div>
      </div>
      <div className="co-body">
        <div className="co2-tot">
          <div className="row-between">
            <div><span className="t3" style={{ fontSize: 12, fontWeight: 600 }}>Total</span><div className="t" style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.03em" }}>{usd(total)}</div><span className="t3 t" style={{ fontSize: 12 }}>{bs(totalBs)}</span></div>
            <div style={{ textAlign: "right", padding: "8px 12px", borderRadius: 14, background: falta > 0.001 ? "var(--warn-soft)" : "var(--ok-soft)", color: falta > 0.001 ? "var(--warn)" : "var(--ok)" }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{falta > 0.001 ? "Falta" : "Cubierto"}</span>
              <div className="t" style={{ fontSize: 20, fontWeight: 800 }}>{usd(falta > 0.001 ? falta : total)}</div>
            </div>
          </div>
          <div className="progress">
            {lineas.map((l) => { const w = total > 0 ? Math.min(100, (aporteUsd(l) / total) * 100) : 0; return w > 0 ? <i key={l.key} style={{ width: w + "%", background: forma(l.metodo).color }} /> : null; })}
          </div>
        </div>

        <h3 className="h3">Formas de pago ({lineas.length})</h3>
        <div className="co2-rows">
          {lineas.map((l) => {
            const f = forma(l.metodo); const ap = aporteUsd(l); const lista = ap > 0 && refOk(l);
            return (
              <button key={l.key} className="co2-row press" onClick={() => { setHoja(l.key); setActiva(l.key); setCampo(f.ref && !l.ref ? "ref" : "monto"); }}>
                <span className="co2-ic" style={colorStyle(f.color)}><UIcono k={f.icon} sw={1.8} /></span>
                <div className="txt"><b>{f.n}</b><span>{ap > 0 ? (f.moneda === "USD" ? "= " + bs(r2(numOf(l.monto) * tasa)) : "= " + usd(ap)) + (l.ref ? " · ref. " + l.ref : "") : "Toca para escribir el monto"}</span></div>
                <div className="amt"><b className="t">{numOf(l.monto) > 0 ? (f.moneda === "USD" ? usd(numOf(l.monto)) : bs(numOf(l.monto))) : (f.moneda === "USD" ? "$ 0" : "Bs 0")}</b>
                  {lista ? <span className="pill ok"><UIcono k="check" sw={2.5} />Listo</span> : <span className="pill brand">Pendiente</span>}</div>
              </button>
            );
          })}
        </div>
        {disponibles.length > 0 && (
          <div className="co2-addrow">
            {disponibles.map((f) => (
              <button key={f.id} className="co2-addbtn press" onClick={() => agregar(f.id)}><span style={{ color: f.color }}><UIcono k="plus" sw={2} /></span>{f.n}</button>
            ))}
          </div>
        )}
        <div className={"co2-change" + (vuelto > 0.001 ? " ok" : " neutral")}><b className="small">{vuelto > 0.001 ? "Vuelto (del efectivo)" : "El vuelto sale solo del efectivo"}</b><b className="h3 t">{usd(vuelto)}</b></div>
        {err && <p className="pinmsg err">{err}</p>}
      </div>
      <div className="co-foot">
        <button className="btn primary big press" disabled={!valido} onClick={confirmar}>
          {valido ? "Confirmar pago · " + usd(total) : "Faltan " + usd(falta)}
        </button>
      </div>

      {act && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setHoja(null); }}>
          <div className="sheet co2-sheet">
            <div className="grab" />
            <div className="row-between" style={{ width: "100%" }}>
              <div className="row" style={{ alignItems: "center", gap: 10 }}>
                <span className="co2-ic" style={{ ...colorStyle(forma(act.metodo).color), width: 36, height: 36 }}><UIcono k={forma(act.metodo).icon} sw={1.8} /></span>
                <div><h3 style={{ margin: 0 }}>Monto en {forma(act.metodo).n}</h3><span className="t" style={{ fontSize: 12, color: "var(--warn)", fontWeight: 600 }}>Falta {usd(falta)} · {bs(r2(falta * tasa))}</span></div>
              </div>
              <button className="sq34 press" onClick={() => setHoja(null)}><UIcono k="close" sw={2} /></button>
            </div>
            <span className="t" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-.03em", color: numOf(act.monto) > 0 ? "var(--text)" : "var(--text-3)" }}>
              {forma(act.metodo).moneda === "USD" ? "$ " : "Bs "}{act.monto || "0"}{campo === "monto" && <span className="caret" style={{ height: 30 }} />}
            </span>
            {forma(act.metodo).ref && (
              <button className={"co2-reffield" + (campo === "ref" ? " on" : "")} style={{ width: "100%" }} onClick={() => setCampo("ref")}>
                <b className={act.ref ? "t" : "t3"}>{act.ref || "Referencia (últimos 6 dígitos)"}{campo === "ref" && <span className="caret" />}</b>
                {act.ref.length >= 4 && <span style={{ color: "var(--ok)" }}><UIcono k="check" sw={2} /></span>}
              </button>
            )}
            <div className="co2-sheet-cuts">
              <button className="co2-scut acc press" onClick={() => { setCampo("monto"); ponerResto(act); }}>Poner el resto</button>
              <button className="co2-scut press" onClick={() => setMonto(act.key, "")}>Borrar</button>
              {lineas.length > 1 && <button className="co2-scut press" onClick={() => quitar(act.key)}>Quitar</button>}
            </div>
            <div className="keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", campo === "ref" ? "clr" : ",", "0", "del"].map((k) => (
                <button key={k} className={"key press" + (k === "clr" ? " fn" : "")} onClick={() => tecla(k, act.key, campo)}>
                  {k === "del" ? <UIcono k="del" /> : k === "clr" ? "Borrar" : k}
                </button>
              ))}
            </div>
            <button className="btn primary big press" onClick={() => setHoja(null)}>Listo</button>
          </div>
        </div>
      )}
    </div>
  );
}
