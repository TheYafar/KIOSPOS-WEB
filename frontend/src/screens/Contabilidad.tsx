import { useEffect, useMemo, useState } from "react";
import { UIcono } from "../icons";
import { getTasa } from "../session";
import {
  contaActualizarGasto, contaActualizarLinea, contaCrearGasto, contaCrearLinea,
  contaEliminarGasto, contaEliminarLinea, contaGastos, contaGetReparto, contaLibro,
  contaResumen, contaSetReparto,
  type CategoriaGasto, type Gasto, type LibroConta, type LineaLibro, type ResumenConta, type TipoLinea,
} from "../api";

const money = (n: number) => (n || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number, tasa: number) => "Bs " + Math.round((n || 0) * tasa).toLocaleString("es-VE");
const numOf = (s: string) => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0 : 0);
const fechaCorta = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "short" });

function isoLocal(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Periodo = "dia" | "semana" | "mes" | "rango";
const CAT_LABEL: Record<CategoriaGasto, string> = { SERVICIOS: "Servicios", INTERNET: "Internet", ALQUILER: "Alquiler", OTRO: "Otro" };

function rangoDe(p: Periodo, desdeC: string, hastaC: string): { desde: string; hasta: string; etiqueta: string } {
  const hoy = new Date();
  if (p === "dia") return { desde: isoLocal(hoy), hasta: isoLocal(hoy), etiqueta: "Hoy" };
  if (p === "semana") {
    const d = new Date(hoy); d.setDate(d.getDate() - 6);
    return { desde: isoLocal(d), hasta: isoLocal(hoy), etiqueta: "Últimos 7 días" };
  }
  if (p === "mes") {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const nombre = hoy.toLocaleDateString("es-VE", { month: "long", year: "numeric" });
    return { desde: isoLocal(d), hasta: isoLocal(hoy), etiqueta: nombre.charAt(0).toUpperCase() + nombre.slice(1) };
  }
  return { desde: desdeC, hasta: hastaC, etiqueta: "Rango" };
}

type ModalConta =
  | null
  | { t: "gasto"; g?: Gasto }
  | { t: "linea"; l?: LineaLibro }
  | { t: "borrarGasto"; g: Gasto }
  | { t: "borrarLinea"; l: LineaLibro };

/** Contabilidad del dueño: tablero automático (entró/salió/queda/reparto) y libro manual. */
export function Contabilidad() {
  const [seccion, setSeccion] = useState<"auto" | "libro">("auto");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const hoy = isoLocal(new Date());
  const [desdeC, setDesdeC] = useState(hoy);
  const [hastaC, setHastaC] = useState(hoy);
  const { desde, hasta, etiqueta } = useMemo(() => rangoDe(periodo, desdeC, hastaC), [periodo, desdeC, hastaC]);

  const [resumen, setResumen] = useState<ResumenConta | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [reparto, setReparto] = useState<number>(40);
  const [libro, setLibro] = useState<LibroConta | null>(null);
  const [modal, setModal] = useState<ModalConta>(null);
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);
  const tasa = parseFloat((getTasa() || "0").replace(",", ".")) || 0;

  const aviso = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  const cargarAuto = () => {
    setCargando(true);
    return Promise.all([contaResumen(desde, hasta), contaGastos(desde, hasta), contaGetReparto()])
      .then(([r, g, p]) => { setResumen(r); setGastos(g); setReparto(p); })
      .catch((e) => aviso(e.message || "No se pudo cargar"))
      .finally(() => setCargando(false));
  };
  const cargarLibro = () => {
    setCargando(true);
    return contaLibro(desde, hasta).then(setLibro)
      .catch((e) => aviso(e.message || "No se pudo cargar"))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    if (seccion === "auto") cargarAuto(); else cargarLibro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seccion, desde, hasta]);

  const tras = async (p: Promise<unknown>, txt: string) => {
    try {
      await p;
      setModal(null);
      aviso(txt);
      if (seccion === "auto") await cargarAuto(); else await cargarLibro();
    } catch (e) {
      aviso((e as Error).message || "Error");
    }
  };

  return (
    <div className="conta">
      <div className="conta-wrap">
        <div className="conta-bar">
          <h1 className="conta-title">Contabilidad</h1>
          <div className="conta-seg">
            <button className={seccion === "auto" ? "on" : ""} onClick={() => setSeccion("auto")}>Automática</button>
            <button className={seccion === "libro" ? "on" : ""} onClick={() => setSeccion("libro")}>Mi libro</button>
          </div>
        </div>

        {/* Selector de período */}
        <div className="conta-per">
          {(["dia", "semana", "mes", "rango"] as Periodo[]).map((p) => (
            <button key={p} className={periodo === p ? "on" : ""} onClick={() => setPeriodo(p)}>
              {p === "dia" ? "Día" : p === "semana" ? "Semana" : p === "mes" ? "Mes" : "Rango"}
            </button>
          ))}
          {periodo === "rango" ? (
            <span className="conta-rango">
              <input className="inp" type="date" value={desdeC} max={hastaC} onChange={(e) => setDesdeC(e.target.value)} />
              <span>a</span>
              <input className="inp" type="date" value={hastaC} min={desdeC} max={hoy} onChange={(e) => setHastaC(e.target.value)} />
            </span>
          ) : (
            <span className="conta-perlbl">{etiqueta}</span>
          )}
        </div>

        {msg && <div className="conta-toast"><UIcono k="check" sw={2.4} />{msg}</div>}

        {seccion === "auto" ? (
          <AutoVista resumen={resumen} gastos={gastos} reparto={reparto} tasa={tasa} cargando={cargando}
            onAgregarGasto={() => setModal({ t: "gasto" })}
            onEditarGasto={(g) => setModal({ t: "gasto", g })}
            onBorrarGasto={(g) => setModal({ t: "borrarGasto", g })}
            onReparto={(pct) => tras(contaSetReparto(pct).then((v) => setReparto(v)), "Reparto guardado")} />
        ) : (
          <LibroVista libro={libro} cargando={cargando}
            onAgregar={() => setModal({ t: "linea" })}
            onEditar={(l) => setModal({ t: "linea", l })}
            onBorrar={(l) => setModal({ t: "borrarLinea", l })} />
        )}
      </div>

      {modal?.t === "gasto" && (
        <ModalGasto gasto={modal.g} fechaDefecto={hasta}
          onClose={() => setModal(null)}
          onHecho={(d) => tras(
            modal.g ? contaActualizarGasto(modal.g.id, d) : contaCrearGasto(d),
            modal.g ? "Gasto actualizado" : "Gasto agregado")} />
      )}
      {modal?.t === "linea" && (
        <ModalLinea linea={modal.l} fechaDefecto={hasta}
          onClose={() => setModal(null)}
          onHecho={(d) => tras(
            modal.l ? contaActualizarLinea(modal.l.id, d) : contaCrearLinea(d),
            modal.l ? "Línea actualizada" : "Línea agregada")} />
      )}
      {modal?.t === "borrarGasto" && (
        <ModalBorrar titulo="Borrar gasto" texto={`¿Borrar "${modal.g.concepto}" (${usd(modal.g.montoUsd)})?`}
          onClose={() => setModal(null)}
          onConfirm={() => tras(contaEliminarGasto(modal.g.id), "Gasto borrado")} />
      )}
      {modal?.t === "borrarLinea" && (
        <ModalBorrar titulo="Borrar línea" texto={`¿Borrar "${modal.l.concepto}" (${usd(modal.l.montoUsd)})?`}
          onClose={() => setModal(null)}
          onConfirm={() => tras(contaEliminarLinea(modal.l.id), "Línea borrada")} />
      )}
    </div>
  );
}

// ======================= AUTOMÁTICA =======================

function AutoVista({ resumen, gastos, reparto, tasa, cargando, onAgregarGasto, onEditarGasto, onBorrarGasto, onReparto }: {
  resumen: ResumenConta | null; gastos: Gasto[]; reparto: number; tasa: number; cargando: boolean;
  onAgregarGasto: () => void; onEditarGasto: (g: Gasto) => void; onBorrarGasto: (g: Gasto) => void;
  onReparto: (pct: number) => void;
}) {
  const [pctEdit, setPctEdit] = useState(String(reparto));
  useEffect(() => { setPctEdit(String(reparto)); }, [reparto]);

  if (!resumen) return <p className="noresult">{cargando ? "Cargando…" : "Sin datos del período."}</p>;

  const v = resumen.anterior.variacionPct;
  const quedaPos = resumen.queda >= 0;

  return (
    <>
      <div className="conta-sum3">
        <div className="card conta-kpi">
          <div className="k">Entró (ganancia)</div>
          <div className="v">{usd(resumen.entro)}</div>
          <div className="d">ventas − costo · ≈ {bs(resumen.entro, tasa)}</div>
        </div>
        <div className="card conta-kpi">
          <div className="k">Salió</div>
          <div className="v">{usd(resumen.salio)}</div>
          <div className="d">nómina + servicios + otros</div>
        </div>
        <div className="card conta-kpi">
          <div className="k">Te queda</div>
          <div className={"v " + (quedaPos ? "up" : "down")}>{usd(resumen.queda)}</div>
          <div className={"d " + (v == null ? "" : v >= 0 ? "up" : "down")}>
            {v == null ? "sin período anterior" : `${v >= 0 ? "▲" : "▼"} ${Math.abs(v)}% vs período anterior`}
          </div>
        </div>
      </div>

      <div className="conta-cols">
        <div className="card">
          <div className="cardhead"><h3>En qué se fue ({usd(resumen.salio)})</h3></div>
          <div className="conta-erow">
            <span className="ico warn"><UIcono k="wallet" sw={2} /></span>
            <span className="nm">Nómina <span className="sub">· del módulo Nómina</span></span>
            <span className="amt">{usd(resumen.nomina)}</span>
          </div>
          <div className="conta-erow">
            <span className="ico accent"><UIcono k="bills" sw={2} /></span>
            <span className="nm">Servicios (internet, luz, agua, alquiler)</span>
            <span className="amt">{usd(resumen.servicios)}</span>
          </div>
          <div className="conta-erow">
            <span className="ico mute"><UIcono k="more" sw={2} /></span>
            <span className="nm">Otros gastos</span>
            <span className="amt">{usd(resumen.otros)}</span>
          </div>
          {resumen.nomina === 0 && (
            <p className="hint" style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "flex-start" }}>
              <UIcono k="alert" sw={2} /> La nómina mostrará $0 hasta que se active su módulo.
            </p>
          )}
        </div>

        <div className="card">
          <div className="cardhead"><h3>Cómo se reparte lo que queda</h3></div>
          <div className="conta-reparto">
            <div className="rbox merc"><div className="k">Para mercancía</div><div className="v">{usd(resumen.mercancia)}</div><div className="p">{money(reparto)}% · reponer stock</div></div>
            <div className="rbox bol"><div className="k">Para tu bolsillo</div><div className="v">{usd(resumen.bolsillo)}</div><div className="p">{money(100 - reparto)}% · limpio para ti</div></div>
          </div>
          <div className="conta-pct">
            <label className="lbl" style={{ flex: 1 }}>% a mercancía
              <input className="inp" inputMode="decimal" value={pctEdit}
                onChange={(e) => setPctEdit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onReparto(numOf(pctEdit))} />
            </label>
            <button className="btn primary" disabled={numOf(pctEdit) === reparto} onClick={() => onReparto(numOf(pctEdit))}>Guardar</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardhead">
          <h3>Gastos anotados</h3>
          <button className="btn ghost" onClick={onAgregarGasto}><UIcono k="plus" sw={2} /> Agregar gasto</button>
        </div>
        {gastos.length === 0 ? (
          <p className="noresult">No hay gastos anotados en este período.</p>
        ) : (
          <div className="conta-gastos">
            {gastos.map((g) => (
              <div className="conta-grow" key={g.id}>
                <span className={"tag cat-" + g.categoria.toLowerCase()}>{CAT_LABEL[g.categoria]}</span>
                <div className="grow"><div className="ml">{g.concepto}</div><div className="md">{fechaCorta(g.fecha)}</div></div>
                <div className="amt">{usd(g.montoUsd)}</div>
                <button className="iconbtn" title="Editar" onClick={() => onEditarGasto(g)}><UIcono k="edit" sw={1.8} /></button>
                <button className="iconbtn" title="Borrar" onClick={() => onBorrarGasto(g)}><UIcono k="trash" sw={1.8} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ======================= MI LIBRO =======================

function LibroVista({ libro, cargando, onAgregar, onEditar, onBorrar }: {
  libro: LibroConta | null; cargando: boolean;
  onAgregar: () => void; onEditar: (l: LineaLibro) => void; onBorrar: (l: LineaLibro) => void;
}) {
  if (!libro) return <p className="noresult">{cargando ? "Cargando…" : "Sin datos."}</p>;
  return (
    <>
      <div className="conta-note">
        📓 Esta libreta es 100% tuya: la app <b>solo guarda y suma</b> lo que escribes. No mete ningún número por su cuenta.
      </div>
      <div className="card">
        <div className="cardhead">
          <h3>Mi libro</h3>
          <button className="btn primary" onClick={onAgregar}><UIcono k="plus" sw={2} /> Agregar línea</button>
        </div>
        {libro.lineas.length === 0 ? (
          <p className="noresult">Aún no has escrito ninguna línea.</p>
        ) : (
          <table className="conta-lib">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th className="r">Monto</th><th></th></tr></thead>
            <tbody>
              {libro.lineas.map((l) => (
                <tr key={l.id}>
                  <td>{fechaCorta(l.fecha)}</td>
                  <td>{l.concepto}</td>
                  <td><span className={"tag " + (l.tipo === "INGRESO" ? "ing" : "egr")}>{l.tipo === "INGRESO" ? "Ingreso" : "Egreso"}</span></td>
                  <td className="r money">{(l.tipo === "INGRESO" ? "+ " : "− ") + usd(l.montoUsd)}</td>
                  <td className="r">
                    <button className="iconbtn" title="Editar" onClick={() => onEditar(l)}><UIcono k="edit" sw={1.8} /></button>
                    <button className="iconbtn" title="Borrar" onClick={() => onBorrar(l)}><UIcono k="trash" sw={1.8} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="conta-libtot">
          <div className="rbox bol"><div className="k">Ingresos</div><div className="v">{usd(libro.ingresos)}</div></div>
          <div className="rbox merc"><div className="k">Egresos</div><div className="v">{usd(libro.egresos)}</div></div>
          <div className="rbox"><div className="k">Saldo</div><div className={"v " + (libro.saldo >= 0 ? "up" : "down")}>{usd(libro.saldo)}</div></div>
        </div>
      </div>
    </>
  );
}

// ======================= MODALES =======================

const CATS: CategoriaGasto[] = ["SERVICIOS", "INTERNET", "ALQUILER", "OTRO"];

function ModalGasto({ gasto, fechaDefecto, onClose, onHecho }: {
  gasto?: Gasto; fechaDefecto: string; onClose: () => void; onHecho: (d: Omit<Gasto, "id">) => void;
}) {
  const [fecha, setFecha] = useState(gasto?.fecha ?? fechaDefecto);
  const [categoria, setCategoria] = useState<CategoriaGasto>(gasto?.categoria ?? "SERVICIOS");
  const [concepto, setConcepto] = useState(gasto?.concepto ?? "");
  const [monto, setMonto] = useState(gasto ? String(gasto.montoUsd).replace(".", ",") : "");
  const n = numOf(monto);
  const ok = n > 0 && concepto.trim().length > 0;
  return (
    <Overlay titulo={gasto ? "Editar gasto" : "Agregar gasto"} onClose={onClose}>
      <label className="lbl">Fecha
        <input className="inp" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="lbl">Categoría
        <div className="conta-catseg">
          {CATS.map((c) => (
            <button key={c} type="button" className={categoria === c ? "on" : ""} onClick={() => setCategoria(c)}>{CAT_LABEL[c]}</button>
          ))}
        </div>
      </label>
      <label className="lbl">Concepto
        <input className="inp" autoFocus value={concepto} placeholder="Ej. Recibo de luz" onChange={(e) => setConcepto(e.target.value)} />
      </label>
      <label className="lbl">Monto en $
        <input className="inp t" inputMode="decimal" value={monto} placeholder="0,00"
          onChange={(e) => setMonto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ok && onHecho({ fecha, categoria, concepto: concepto.trim(), montoUsd: n })} />
      </label>
      <button className="btn primary center" disabled={!ok} onClick={() => onHecho({ fecha, categoria, concepto: concepto.trim(), montoUsd: n })}>
        {ok ? (gasto ? "Guardar cambios" : "Agregar · " + usd(n)) : "Completa concepto y monto"}
      </button>
    </Overlay>
  );
}

function ModalLinea({ linea, fechaDefecto, onClose, onHecho }: {
  linea?: LineaLibro; fechaDefecto: string; onClose: () => void; onHecho: (d: Omit<LineaLibro, "id">) => void;
}) {
  const [fecha, setFecha] = useState(linea?.fecha ?? fechaDefecto);
  const [tipo, setTipo] = useState<TipoLinea>(linea?.tipo ?? "INGRESO");
  const [concepto, setConcepto] = useState(linea?.concepto ?? "");
  const [monto, setMonto] = useState(linea ? String(linea.montoUsd).replace(".", ",") : "");
  const n = numOf(monto);
  const ok = n > 0 && concepto.trim().length > 0;
  const guardar = () => ok && onHecho({ fecha, tipo, concepto: concepto.trim(), montoUsd: n });
  return (
    <Overlay titulo={linea ? "Editar línea" : "Agregar línea"} onClose={onClose}>
      <label className="lbl">Fecha
        <input className="inp" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </label>
      <label className="lbl">Tipo
        <div className="conta-catseg dos">
          <button type="button" className={tipo === "INGRESO" ? "on" : ""} onClick={() => setTipo("INGRESO")}>Ingreso</button>
          <button type="button" className={tipo === "EGRESO" ? "on" : ""} onClick={() => setTipo("EGRESO")}>Egreso</button>
        </div>
      </label>
      <label className="lbl">Concepto
        <input className="inp" autoFocus value={concepto} placeholder="Ej. Aporte, compra…" onChange={(e) => setConcepto(e.target.value)} />
      </label>
      <label className="lbl">Monto en $
        <input className="inp t" inputMode="decimal" value={monto} placeholder="0,00"
          onChange={(e) => setMonto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardar()} />
      </label>
      <button className="btn primary center" disabled={!ok} onClick={guardar}>
        {ok ? (linea ? "Guardar cambios" : "Agregar línea") : "Completa concepto y monto"}
      </button>
    </Overlay>
  );
}

function ModalBorrar({ titulo, texto, onClose, onConfirm }: {
  titulo: string; texto: string; onClose: () => void; onConfirm: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Overlay titulo={titulo} onClose={onClose}>
      <p style={{ fontSize: 14, color: "var(--text)", margin: 0 }}>{texto}</p>
      <div className="conta-confacts">
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn danger" disabled={enviando} onClick={() => { setEnviando(true); onConfirm(); }}>Borrar</button>
      </div>
    </Overlay>
  );
}

function Overlay({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head"><h2>{titulo}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
