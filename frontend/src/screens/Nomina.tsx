import { useEffect, useMemo, useState } from "react";
import { UIcono } from "../icons";
import { getTasa } from "../session";
import {
  ajustarPagado, buscarProductos, calcSaldo, eliminarMovimiento, fijarSueldo, listarEmpleados, registrarConsumo, registrarPago,
  type Empleado, type MovNomina, type Periodo, type ProductoLite,
} from "../nomina";

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(Math.round(n));
const numOf = (s: string) => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0 : 0);

const AV = ["var(--c-charcuteria)", "var(--c-bebidas)", "var(--c-limpieza)", "var(--c-chucherias)", "var(--c-viveres)", "var(--c-panaderia)"];
const avColor = (id: number) => AV[id % AV.length];
const inicial = (n: string) => (n.trim().charAt(0) || "·").toUpperCase();
const periodoN = (p: Periodo) => (p === "QUINCENAL" ? "quincena" : "semana");
const fechaCorta = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("es-VE", { day: "numeric", month: "short" });

type Modal = null | { t: "pago" } | { t: "consumo" } | { t: "sueldo" } | { t: "pagado" } | { t: "borrar"; mov: MovNomina };

export function Nomina({ seed }: { seed?: Empleado[] } = {}) {
  const [emps, setEmps] = useState<Empleado[]>(seed ?? []);
  const [selId, setSelId] = useState<number | null>(seed?.[0]?.usuarioId ?? null);
  const [modal, setModal] = useState<Modal>(null);
  const [msg, setMsg] = useState("");
  const tasa = parseFloat((getTasa() || "0").replace(",", ".")) || 0;

  const cargar = (foco?: number) =>
    listarEmpleados().then((es) => {
      setEmps(es);
      setSelId((prev) => foco ?? prev ?? es[0]?.usuarioId ?? null);
    });
  useEffect(() => { cargar(); }, []);

  const emp = emps.find((e) => e.usuarioId === selId) || null;
  const saldo = useMemo(() => (emp ? calcSaldo(emp) : null), [emp]);

  const tras = async (p: Promise<Empleado>, aviso: string) => {
    const e = await p;
    await cargar(e.usuarioId);
    setModal(null);
    setMsg(aviso);
    setTimeout(() => setMsg(""), 2500);
  };

  return (
    <div className="nomscreen">
      <div className="nom-wrap">
        <div className="nom-bar">
          <h1 className="nom-title">Nómina</h1>
          {emp && <span className="nom-per">{emp.periodo === "QUINCENAL" ? "Quincena" : "Semana"} en curso</span>}
        </div>
        {msg && <div className="nom-toast"><UIcono k="check" sw={2.4} />{msg}</div>}

        {emps.length === 0 ? (
          <p className="noresult">Aún no hay empleados con sueldo configurado.</p>
        ) : (
          <div className="nom-grid">
            {/* Lista de empleados */}
            <div className="nom-list card">
              {emps.map((e) => {
                const s = calcSaldo(e);
                const pos = s.saldo >= 0;
                return (
                  <button
                    key={e.usuarioId}
                    className={"nom-emp" + (e.usuarioId === selId ? " sel" : "")}
                    onClick={() => setSelId(e.usuarioId)}
                  >
                    <span className="nom-av" style={{ background: avColor(e.usuarioId) }}>{inicial(e.nombre)}</span>
                    <span className="nom-who">
                      <span className="nm">{e.nombre}</span>
                      <span className="rl">{e.rol} · {usd(e.sueldoUsd)} / {periodoN(e.periodo)}</span>
                    </span>
                    <span className={"nom-sal " + (pos ? "pos" : "neg")}>
                      {pos ? usd(s.saldo) : "−" + usd(Math.abs(s.saldo))}
                      <small>{pos ? "le debes" : "te debe"}</small>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Detalle del empleado */}
            {emp && saldo && (
              <div className="nom-detail card">
                <div className="nom-dhead">
                  <span className="nom-av big" style={{ background: avColor(emp.usuarioId) }}>{inicial(emp.nombre)}</span>
                  <div className="grow">
                    <h3>{emp.nombre}</h3>
                    <div className="rl">{emp.rol} · sueldo {usd(emp.sueldoUsd)} por {periodoN(emp.periodo)}</div>
                  </div>
                </div>

                <div className="nom-sum3">
                  <button className="nom-box editable" onClick={() => setModal({ t: "sueldo" })}>
                    <span className="nom-edit"><UIcono k="edit" sw={1.8} /></span>
                    <div className="k">Le toca</div>
                    <div className="v">{usd(saldo.leToca)}</div>
                    <div className="d">sueldo de la {periodoN(emp.periodo)} · tocar para editar</div>
                  </button>
                  <button className="nom-box editable" onClick={() => setModal({ t: "pagado" })}>
                    <span className="nom-edit"><UIcono k="edit" sw={1.8} /></span>
                    <div className="k">Le has pagado</div>
                    <div className="v">{usd(saldo.pagado)}</div>
                    <div className="d">{saldo.consumos > 0 ? "aparte: consumos " + usd(saldo.consumos) : "lo que ya le diste"}</div>
                  </button>
                  <div className="nom-box">
                    <div className="k">{saldo.saldo >= 0 ? "Saldo: le debes" : "Saldo: te debe"}</div>
                    <div className={"v " + (saldo.saldo >= 0 ? "pos" : "neg")}>
                      {saldo.saldo >= 0 ? usd(saldo.saldo) : "−" + usd(Math.abs(saldo.saldo))}
                    </div>
                    <div className="d">≈ {bs(Math.abs(saldo.saldo) * tasa)}</div>
                  </div>
                </div>

                <div className="nom-acts">
                  <button className="nom-btn pri" onClick={() => setModal({ t: "pago" })}>
                    <UIcono k="plus" sw={2.2} />Registrar pago
                  </button>
                  <button className="nom-btn" onClick={() => setModal({ t: "consumo" })}>
                    <UIcono k="cart" sw={1.9} />Registrar consumo
                  </button>
                </div>

                <div className="nom-h4">Movimientos de la {periodoN(emp.periodo)}</div>
                {emp.movimientos.length === 0 && <p className="hint" style={{ padding: "4px 2px" }}>Sin movimientos todavía.</p>}
                {[...emp.movimientos].sort((a, b) => (b.fecha < a.fecha ? -1 : b.fecha > a.fecha ? 1 : b.id - a.id)).map((m) => (
                  <MovRow key={m.id} m={m} onBorrar={() => setModal({ t: "borrar", mov: m })} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modal?.t === "pago" && emp && (
        <ModalPago emp={emp} onClose={() => setModal(null)} onHecho={(e) => tras(Promise.resolve(e), "Pago registrado")} />
      )}
      {modal?.t === "consumo" && emp && (
        <ModalConsumo emp={emp} onClose={() => setModal(null)} onHecho={(e) => tras(Promise.resolve(e), "Consumo registrado")} />
      )}
      {modal?.t === "sueldo" && emp && (
        <ModalSueldo emp={emp} onClose={() => setModal(null)} onHecho={(e) => tras(Promise.resolve(e), "Sueldo actualizado")} />
      )}
      {modal?.t === "pagado" && emp && saldo && (
        <ModalPagado emp={emp} pagadoActual={saldo.pagado} onClose={() => setModal(null)}
          onHecho={(e) => tras(Promise.resolve(e), "Pagado actualizado")} />
      )}
      {modal?.t === "borrar" && emp && (
        <ModalBorrar mov={modal.mov} onClose={() => setModal(null)}
          onConfirm={() => tras(eliminarMovimiento(emp.usuarioId, modal.mov.id), "Movimiento eliminado")} />
      )}
    </div>
  );
}

function movCfg(m: MovNomina) {
  if (m.tipo === "PAGO") {
    const ajuste = m.metodo === "Ajuste manual";
    const neg = m.montoUsd < 0;
    return {
      chip: "pago", icon: "cash", cls: neg ? "neg" : "pos",
      ml: ajuste ? "Ajuste de lo pagado" : "Pago / abono",
      md: fechaCorta(m.fecha) + (m.metodo && !ajuste ? " · " + m.metodo : ""),
      mv: (neg ? "− " : "+ ") + usd(Math.abs(m.montoUsd)),
    };
  }
  if (m.tipo === "CONSUMO") return {
    chip: "consumo", icon: "cart", cls: "neg",
    ml: "Consumo · " + m.productoNombre + (m.cantidad ? " ×" + m.cantidad : ""),
    md: fechaCorta(m.fecha) + " · a precio de venta",
    mv: "− " + usd(m.montoUsd),
  };
  return {
    chip: "ajuste", icon: "mix", cls: m.montoUsd >= 0 ? "pos" : "neg",
    ml: "Ajuste" + (m.nota ? " · " + m.nota : ""), md: fechaCorta(m.fecha),
    mv: (m.montoUsd >= 0 ? "+ " : "− ") + usd(Math.abs(m.montoUsd)),
  };
}

function MovRow({ m, onBorrar }: { m: MovNomina; onBorrar: () => void }) {
  const c = movCfg(m);
  return (
    <div className="nom-mov">
      <span className={"nom-chip " + c.chip}><UIcono k={c.icon} sw={2} /></span>
      <div className="grow"><div className="ml">{c.ml}</div><div className="md">{c.md}</div></div>
      <div className={"mv " + c.cls}>{c.mv}</div>
      <button className="nom-del" title="Borrar movimiento" aria-label="Borrar movimiento" onClick={onBorrar}>
        <UIcono k="trash" sw={1.8} />
      </button>
    </div>
  );
}

function ModalBorrar({ mov, onClose, onConfirm }: { mov: MovNomina; onClose: () => void; onConfirm: () => void }) {
  const c = movCfg(mov);
  const [enviando, setEnviando] = useState(false);
  const confirmar = () => { if (enviando) return; setEnviando(true); onConfirm(); };
  return (
    <Overlay titulo="Borrar movimiento" onClose={onClose}>
      <p style={{ fontSize: 14, color: "var(--text)", margin: 0 }}>¿Seguro que quieres borrar este movimiento? Esto corrige el saldo del empleado.</p>
      <div className="nom-confrow">
        <span className={"nom-chip " + c.chip}><UIcono k={c.icon} sw={2} /></span>
        <div className="grow"><div className="ml">{c.ml}</div><div className="md">{c.md}</div></div>
        <div className={"mv " + c.cls}>{c.mv}</div>
      </div>
      {mov.tipo === "CONSUMO" && (
        <p className="hint" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <UIcono k="alert" sw={2} /> El producto vuelve al inventario ({mov.cantidad} unidad{(mov.cantidad ?? 1) > 1 ? "es" : ""}).
        </p>
      )}
      <div className="nom-confacts">
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn nom-danger press" disabled={enviando} onClick={confirmar}>Borrar movimiento</button>
      </div>
    </Overlay>
  );
}

const METODOS = ["Efectivo", "Pago móvil", "Punto", "Biopago"];

function ModalPago({ emp, onClose, onHecho }: { emp: Empleado; onClose: () => void; onHecho: (e: Empleado) => void }) {
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState(METODOS[0]);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const n = numOf(monto);
  const guardar = async () => {
    if (n <= 0 || enviando) return;
    setEnviando(true);
    try { onHecho(await registrarPago(emp.usuarioId, n, metodo, nota.trim() || undefined)); }
    finally { setEnviando(false); }
  };
  return (
    <Overlay onClose={onClose} titulo={"Registrar pago · " + emp.nombre}>
      <label className="lbl">Monto en $
        <input className="inp t" inputMode="decimal" autoFocus placeholder="0,00" value={monto}
          onChange={(e) => setMonto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardar()} />
      </label>
      <label className="lbl">Método
        <div className="nom-seg">
          {METODOS.map((m) => (
            <button key={m} type="button" className={metodo === m ? "on" : ""} onClick={() => setMetodo(m)}>{m}</button>
          ))}
        </div>
      </label>
      <label className="lbl">Nota (opcional)
        <input className="inp" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Referencia, comentario…" />
      </label>
      <button className="cta center press" disabled={n <= 0 || enviando} onClick={guardar}>
        {n > 0 ? "Registrar pago · " + usd(n) : "Escribe el monto"}
      </button>
    </Overlay>
  );
}

function ModalConsumo({ emp, onClose, onHecho }: { emp: Empleado; onClose: () => void; onHecho: (e: Empleado) => void }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<ProductoLite[]>([]);
  const [sel, setSel] = useState<ProductoLite | null>(null);
  const [cant, setCant] = useState("1");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { buscarProductos(q).then(setLista); }, [q]);
  const c = Math.max(1, Math.floor(numOf(cant) || 1));
  const total = sel ? sel.precioUsd * c : 0;
  const guardar = async () => {
    if (!sel || enviando) return;
    setEnviando(true);
    try { onHecho(await registrarConsumo(emp.usuarioId, sel, c)); }
    finally { setEnviando(false); }
  };
  return (
    <Overlay onClose={onClose} titulo={"Registrar consumo · " + emp.nombre}>
      {!sel ? (
        <>
          <label className="lbl">Producto
            <input className="inp" autoFocus placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="nom-plist">
            {lista.map((p) => (
              <button key={p.id} className="nom-prow" onClick={() => setSel(p)}>
                <span className="nm">{p.nombre}</span><span className="pr t">{usd(p.precioUsd)}</span>
              </button>
            ))}
            {lista.length === 0 && <p className="hint" style={{ padding: 8 }}>Sin resultados.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="nom-selp">
            <div><div className="nm">{sel.nombre}</div><div className="hint">{usd(sel.precioUsd)} c/u · a precio de venta</div></div>
            <button className="nom-link" onClick={() => setSel(null)}>Cambiar</button>
          </div>
          <label className="lbl">Cantidad
            <input className="inp t" inputMode="numeric" value={cant}
              onChange={(e) => setCant(e.target.value.replace(/[^\d]/g, ""))} onKeyDown={(e) => e.key === "Enter" && guardar()} />
          </label>
          <div className="nom-cargo">Se le carga al saldo: <b className="t">{usd(total)}</b> · baja {c} del inventario</div>
          <button className="cta center press" disabled={enviando} onClick={guardar}>Registrar consumo · {usd(total)}</button>
        </>
      )}
    </Overlay>
  );
}

function ModalSueldo({ emp, onClose, onHecho }: { emp: Empleado; onClose: () => void; onHecho: (e: Empleado) => void }) {
  const [sueldo, setSueldo] = useState(emp.sueldoUsd ? emp.sueldoUsd.toString().replace(".", ",") : "");
  const [periodo, setPeriodo] = useState<Periodo>(emp.periodo);
  const [enviando, setEnviando] = useState(false);
  const n = numOf(sueldo);
  const guardar = async () => {
    if (n <= 0 || enviando) return;
    setEnviando(true);
    try { onHecho(await fijarSueldo(emp.usuarioId, n, periodo)); }
    finally { setEnviando(false); }
  };
  return (
    <Overlay onClose={onClose} titulo={"Sueldo · " + emp.nombre}>
      <label className="lbl">Sueldo fijo en $
        <input className="inp t" inputMode="decimal" autoFocus value={sueldo} onChange={(e) => setSueldo(e.target.value)} />
      </label>
      <label className="lbl">Período
        <div className="nom-seg">
          <button type="button" className={periodo === "SEMANAL" ? "on" : ""} onClick={() => setPeriodo("SEMANAL")}>Semanal</button>
          <button type="button" className={periodo === "QUINCENAL" ? "on" : ""} onClick={() => setPeriodo("QUINCENAL")}>Quincenal</button>
        </div>
      </label>
      <button className="cta center press" disabled={n <= 0 || enviando} onClick={guardar}>Guardar sueldo</button>
    </Overlay>
  );
}

function ModalPagado({ emp, pagadoActual, onClose, onHecho }: { emp: Empleado; pagadoActual: number; onClose: () => void; onHecho: (e: Empleado) => void }) {
  const [monto, setMonto] = useState(pagadoActual ? pagadoActual.toString().replace(".", ",") : "0");
  const [enviando, setEnviando] = useState(false);
  const n = numOf(monto);
  const dif = Math.round((n - pagadoActual) * 100) / 100;
  const guardar = async () => {
    if (enviando || n < 0) return;
    setEnviando(true);
    try { onHecho(await ajustarPagado(emp.usuarioId, n)); }
    finally { setEnviando(false); }
  };
  return (
    <Overlay onClose={onClose} titulo={"Le has pagado · " + emp.nombre}>
      <p style={{ fontSize: 13, color: "var(--text-2)", margin: 0 }}>
        Escribe el total que le has pagado esta {periodoN(emp.periodo)}. El saldo se ajusta solo.
      </p>
      <label className="lbl">Total pagado en $
        <input className="inp t" inputMode="decimal" autoFocus value={monto}
          onChange={(e) => setMonto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && guardar()} />
      </label>
      {dif !== 0 && (
        <p className="hint">
          {dif > 0 ? "Suma " + usd(dif) + " a lo pagado." : "Resta " + usd(Math.abs(dif)) + " de lo pagado."} Queda anotado como “Ajuste de lo pagado”.
        </p>
      )}
      <button className="cta center press" disabled={enviando || n < 0} onClick={guardar}>Guardar</button>
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
