import { useEffect, useRef, useState } from "react";
import { abonarCliente, actualizarCliente, crearCliente, descontarSueldo, detalleCliente, listarClientes, type ClienteFiado, type MovCliente } from "../api";
import { getSesion, getTasa } from "../session";
import { UIcono } from "../icons";
import { leerMonto } from "../arqueo";

// Fiado: la libreta de clientes y de TRABAJADORES del local. Quién debe, cuánto, desde
// cuándo, y recibir abonos. Lo que se lleva un trabajador baja el stock (es una venta
// fiada) y el dueño se lo descuenta del sueldo. El cajero anota clientes y cobra abonos;
// el límite, los trabajadores y los descuentos de sueldo los maneja el dueño.

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) => "$ " + money(n);
const bs = (n: number) => "Bs " + money(n);
const AV = ["var(--c-bebidas)", "var(--c-limpieza)", "var(--c-chucherias)", "var(--c-viveres)", "var(--c-charcuteria)", "var(--c-panaderia)"];
const esJefe = () => { const r = getSesion()?.rol; return r === "DUENO" || r === "ENCARGADO"; };

function hace(iso: string | null): string {
  if (!iso) return "sin movimientos";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : "hace " + d + " días";
}

export function Clientes() {
  const [lista, setLista] = useState<ClienteFiado[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tipo, setTipo] = useState<"CLIENTE" | "TRABAJADOR">("CLIENTE");
  const buscar = useRef<HTMLInputElement>(null);
  const cargar = () => listarClientes().then((l) => { setLista(l); setErr(""); }).catch((e) => setErr((e as Error).message)).finally(() => setCargando(false));
  useEffect(() => { cargar(); if (window.matchMedia("(min-width:1024px)").matches) buscar.current?.focus(); }, []);

  const f = q.trim().toLowerCase();
  const delTipo = lista.filter((c) => (c.tipo || "CLIENTE") === tipo);
  const vis = delTipo.filter((c) => !f || c.nombre.toLowerCase().includes(f) || (c.cedula || "").toLowerCase().includes(f) || (c.telefono || "").includes(f));
  const deben = delTipo.filter((c) => c.saldoUsd > 0);
  const trabajadores = tipo === "TRABAJADOR";
  const total = deben.reduce((s, c) => s + c.saldoUsd, 0);

  return (
    <div className="caja">
      <div className="scroll pad cli">
        <div className="cli-head">
          <div><h2>Fiado</h2><p>{trabajadores ? "Lo que se llevan tus trabajadores: se descuenta del sueldo." : "Quién te debe y cuánto. Toca un cliente para cobrarle."}</p></div>
          {(!trabajadores || esJefe()) && <button className="btn primary press" onClick={() => setNuevo(true)}><UIcono k="plus" sw={2.2} />{trabajadores ? "Nuevo trabajador" : "Nuevo cliente"}</button>}
        </div>
        <div className="seg cli-tipo" role="tablist" aria-label="Clientes o trabajadores">
          <button className={!trabajadores ? "on" : ""} onClick={() => setTipo("CLIENTE")}>Clientes</button>
          <button className={trabajadores ? "on" : ""} onClick={() => setTipo("TRABAJADOR")}>Trabajadores</button>
        </div>
        <div className="inv-stats">
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}><UIcono k="cash" /></span>
            <div><span className="k">{trabajadores ? "Deben tus trabajadores" : "Te deben"}</span><span className="v t">{usd(total)}</span><span className="d t">{bs(total * (Number(getTasa()) || 0))}</span></div></div>
          <div className="inv-stat"><span className="ibox" style={{ background: "var(--accent-soft)", color: "var(--warn)" }}><UIcono k="user" /></span>
            <div><span className="k">{trabajadores ? "Trabajadores que deben" : "Clientes que deben"}</span><span className="v t">{deben.length}</span><span className="d">de {delTipo.length} anotados</span></div></div>
        </div>
        <label className="search cli-search">
          <UIcono k="search" sw={2} />
          <input ref={buscar} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, cédula o teléfono…" aria-label="Buscar cliente"
            onKeyDown={(e) => { if (e.key === "Enter" && vis[0]) setAbierto(vis[0].id); }} />
        </label>
        {err && <p className="noresult">{err}</p>}
        <div className="cli-list">
          {vis.map((c, i) => {
            const pasado = c.limiteUsd > 0 && c.saldoUsd >= c.limiteUsd;
            return (
              <button key={c.id} className={"card cli-row press" + (c.activo ? "" : " off")} onClick={() => setAbierto(c.id)}>
                <span className="neg-av" style={{ ["--av" as string]: AV[i % AV.length] }}>{c.nombre.charAt(0).toUpperCase()}</span>
                <span className="cli-nm"><b>{c.nombre}</b><small>{[c.cedula, c.telefono].filter(Boolean).join(" · ") || "Sin datos"} · {hace(c.ultimoMovimiento)}</small></span>
                <span className="cli-sal">
                  {c.saldoUsd > 0 ? <b className="t mg-bad">{usd(c.saldoUsd)}</b> : <b className="t cli-cero">Al día</b>}
                  {c.limiteUsd > 0 && <small className={pasado ? "mg-bad" : ""}>límite {usd(c.limiteUsd)}</small>}
                  {c.tipo === "TRABAJADOR" && (c.sueldoUsd || 0) > 0 && <small>sueldo {usd(c.sueldoUsd || 0)}</small>}
                </span>
              </button>
            );
          })}
        </div>
        {!cargando && delTipo.length === 0 && !err && <p className="noresult">{trabajadores
          ? (esJefe() ? "Anota a tus trabajadores con su sueldo: lo que se lleven fiado se descuenta del sueldo." : "El dueño anota a los trabajadores.")
          : "Aún no hay clientes. Anota el primero con “Nuevo cliente” o al cobrar con Fiado."}</p>}
        {delTipo.length > 0 && vis.length === 0 && <p className="noresult">Nadie coincide con “{q}”.</p>}
      </div>
      {nuevo && <FormCliente trabajador={trabajadores} onClose={() => setNuevo(false)} onSaved={(c) => { setNuevo(false); cargar(); setAbierto(c.id); }} />}
      {abierto != null && <DetalleCliente id={abierto} onClose={() => { setAbierto(null); cargar(); }} />}
    </div>
  );
}

export function FormCliente({ cliente, nombreInicial, trabajador, onClose, onSaved }: { cliente?: ClienteFiado; nombreInicial?: string; trabajador?: boolean; onClose: () => void; onSaved: (c: ClienteFiado) => void }) {
  const [nombre, setNombre] = useState(cliente?.nombre || nombreInicial || "");
  const [cedula, setCedula] = useState(cliente?.cedula || "");
  const [tel, setTel] = useState(cliente?.telefono || "");
  const [lim, setLim] = useState(cliente && cliente.limiteUsd > 0 ? String(cliente.limiteUsd).replace(".", ",") : "");
  const [activo, setActivo] = useState(cliente?.activo ?? true);
  const [esTrab, setEsTrab] = useState(cliente ? cliente.tipo === "TRABAJADOR" : !!trabajador);
  const [sueldo, setSueldo] = useState(cliente && (cliente.sueldoUsd || 0) > 0 ? String(cliente.sueldoUsd).replace(".", ",") : "");
  const [err, setErr] = useState("");
  const jefe = esJefe();
  const guardar = async () => {
    if (!nombre.trim()) { setErr("Escribe el nombre"); return; }
    try {
      const body = { nombre: nombre.trim(), cedula: cedula.trim() || undefined, telefono: tel.trim() || undefined,
        ...(jefe ? { limiteUsd: leerMonto(lim) ?? 0, tipo: esTrab ? "TRABAJADOR" : "CLIENTE", sueldoUsd: esTrab ? leerMonto(sueldo) ?? 0 : 0 } : {}) };
      onSaved(cliente ? await actualizarCliente(cliente.id, { ...body, activo }) : await crearCliente(body));
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); guardar(); } else if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
        <div className="modal-head"><h2>{cliente ? "Editar datos" : esTrab ? "Nuevo trabajador" : "Nuevo cliente"}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <label className="lbl">Nombre<input autoFocus className="inp" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder={esTrab ? "Ej: Luis (empleado)" : "Ej: María la vecina"} aria-label="Nombre del cliente" /></label>
          <div className="two">
            <label className="lbl">Cédula <span className="opt">(opcional)</span><input className="inp" value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="V-12345678" aria-label="Cédula" /></label>
            <label className="lbl">Teléfono <span className="opt">(opcional)</span><input className="inp" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="0412-1234567" aria-label="Teléfono" /></label>
          </div>
          {jefe && (
            <button className="cfg-row press" role="switch" aria-checked={esTrab} onClick={() => setEsTrab(!esTrab)}>
              <span className="cfg-tx"><b>Trabaja en el local</b><small>Lo que se lleve fiado se le descuenta del sueldo.</small></span>
              <span className={"sw" + (esTrab ? " on" : "")}><i /></span>
            </button>
          )}
          {jefe && esTrab && (
            <label className="lbl">Sueldo ($)
              <div className="inpw"><i>$</i><input className="inp t pre" inputMode="decimal" value={sueldo} onChange={(e) => setSueldo(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Ej: 150" aria-label="Sueldo del trabajador" /></div>
              <span className="hint">Sin límite propio, no puede deber más que su sueldo.</span>
            </label>
          )}
          {jefe ? (
            <label className="lbl">Límite de fiado <span className="opt">(vacío = sin límite)</span>
              <div className="inpw"><i>$</i><input className="inp t pre" inputMode="decimal" value={lim} onChange={(e) => setLim(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Sin límite" aria-label="Límite de fiado" /></div>
            </label>
          ) : <span className="hint">El límite de fiado lo pone el dueño.</span>}
          {cliente && jefe && (
            <button className="cfg-row press" role="switch" aria-checked={activo} onClick={() => setActivo(!activo)}>
              <span className="cfg-tx"><b>Se le puede fiar</b><small>Apágalo para no fiarle más (su deuda sigue).</small></span>
              <span className={"sw" + (activo ? " on" : "")}><i /></span>
            </button>
          )}
          {err && <p className="pinmsg err">{err}</p>}
        </div>
        <div className="modal-foot"><button className="btn primary big press" disabled={!nombre.trim()} onClick={guardar}>Guardar <kbd className="kb">Enter</kbd></button></div>
      </div>
    </div>
  );
}

const METODOS_ABONO = [
  { id: "EFECTIVO_USD", n: "Efectivo $", moneda: "USD" }, { id: "EFECTIVO_BS", n: "Efectivo Bs", moneda: "VES" },
  { id: "PAGO_MOVIL", n: "Pago móvil", moneda: "VES" }, { id: "PUNTO", n: "Punto", moneda: "VES" }, { id: "BIOPAGO", n: "Biopago", moneda: "VES" },
] as const;

function DetalleCliente({ id, onClose }: { id: number; onClose: () => void }) {
  const [d, setD] = useState<{ cliente: ClienteFiado; movimientos: MovCliente[] } | null>(null);
  const [editar, setEditar] = useState(false);
  const [metodo, setMetodo] = useState<string>("EFECTIVO_USD");
  const [monto, setMonto] = useState("");
  const [refe, setRefe] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [desc, setDesc] = useState("");
  const tasa = Number(getTasa()) || 0;
  const cargar = () => detalleCliente(id).then(setD).catch((e) => setErr((e as Error).message));
  useEffect(() => { cargar(); }, [id]);
  if (!d) return <div className="modal"><div className="modal-card"><div className="modal-body"><span className="hint">{err || "Cargando…"}</span></div></div></div>;
  const c = d.cliente;
  const mon = METODOS_ABONO.find((x) => x.id === metodo)!.moneda;
  const saldoEn = mon === "USD" ? c.saldoUsd : Math.round(c.saldoUsd * tasa * 100) / 100;
  const m = leerMonto(monto) ?? 0;
  const mUsd = mon === "USD" ? m : tasa > 0 ? m / tasa : 0;
  const abonar = async () => {
    if (m <= 0 || enviando) return;
    setEnviando(true); setErr(""); setOk("");
    try {
      await abonarCliente(c.id, { metodo, monto: m, ...(mon === "VES" ? { tasa } : {}), ...(refe.trim() ? { referencia: refe.trim() } : {}) });
      setOk("Abono de " + (mon === "USD" ? usd(m) : bs(m)) + " registrado ✓"); setMonto(""); setRefe(""); await cargar();
      window.dispatchEvent(new Event("kp-turno"));
    } catch (e) { setErr((e as Error).message); }
    finally { setEnviando(false); }
  };
  const trab = c.tipo === "TRABAJADOR";
  const descontar = async () => {
    const mUsd = leerMonto(desc) ?? c.saldoUsd;
    if (!window.confirm(`¿Descontar ${usd(mUsd)} del sueldo de ${c.nombre}?`)) return;
    setEnviando(true); setErr(""); setOk("");
    try { await descontarSueldo(c.id, mUsd); setOk("Descontado del sueldo: " + usd(mUsd) + " ✓"); setDesc(""); await cargar(); }
    catch (e) { setErr((e as Error).message); }
    finally { setEnviando(false); }
  };
  const tel = (c.telefono || "").replace(/\D/g, "");
  const wa = tel ? "https://wa.me/" + (tel.startsWith("0") ? "58" + tel.slice(1) : tel) + "?text=" + encodeURIComponent(`Hola ${c.nombre}, te recordamos que tienes una cuenta pendiente de ${usd(c.saldoUsd)} (${bs(c.saldoUsd * tasa)} a la tasa de hoy). ¡Gracias!`) : "";

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card cli-det" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
        <div className="modal-head"><h2>{c.nombre}</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <div className={"cli-saldo" + (c.saldoUsd > 0 ? " debe" : "")}>
            <span>{c.saldoUsd > 0 ? "Debe" : "Está al día"}</span>
            <b className="t">{usd(c.saldoUsd)}</b>
            {c.saldoUsd > 0 && <small className="t">{bs(c.saldoUsd * tasa)} a la tasa de hoy</small>}
            {c.limiteUsd > 0 && <small>Límite {usd(c.limiteUsd)}</small>}
            {trab && (c.sueldoUsd || 0) > 0 && <small>Sueldo {usd(c.sueldoUsd || 0)} · le quedaría {usd(Math.max(0, (c.sueldoUsd || 0) - c.saldoUsd))}</small>}
            {!c.activo && <span className="pill late">No se le fía</span>}
          </div>
          <div className="cli-acc">
            {wa && c.saldoUsd > 0 && <a className="btn2 press" href={wa} target="_blank" rel="noreferrer"><UIcono k="phone" />Recordar por WhatsApp</a>}
            <button className="btn2 press" onClick={() => setEditar(true)}><UIcono k="user" />Editar datos</button>
          </div>

          {trab && c.saldoUsd > 0 && esJefe() && (
            <div className="cli-abono">
              <h3 className="h3">Descontar del sueldo</h3>
              <div className="cli-abono-in">
                <div className="inpw"><i>$</i><input className="inp t" style={{ paddingLeft: 30 }} inputMode="decimal" placeholder={money(c.saldoUsd)}
                  value={desc} onChange={(e) => setDesc(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Monto a descontar del sueldo" /></div>
                <button className="btn primary press" disabled={enviando} onClick={descontar}>Descontar {usd(leerMonto(desc) ?? c.saldoUsd)}</button>
              </div>
              <span className="hint">No toca la caja: queda anotado como descuento de nómina. Vacío = todo lo que debe.</span>
            </div>
          )}
          {c.saldoUsd > 0 && (
            <div className="cli-abono">
              <h3 className="h3">{trab ? "O recibir un pago" : "Recibir abono"}</h3>
              <div className="seg cli-met">
                {METODOS_ABONO.map((x) => <button key={x.id} className={metodo === x.id ? "on" : ""} onClick={() => { setMetodo(x.id); setMonto(""); }}>{x.n}</button>)}
              </div>
              <div className="cli-abono-in">
                <div className="inpw"><i>{mon === "USD" ? "$" : "Bs"}</i><input autoFocus className="inp t" style={{ paddingLeft: mon === "USD" ? 30 : 40 }} inputMode="decimal" placeholder="0,00"
                  value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ""))} aria-label="Monto del abono"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); abonar(); } }} /></div>
                <button className="btn2 press" onClick={() => setMonto(money(saldoEn))}>Todo · {mon === "USD" ? usd(saldoEn) : bs(saldoEn)}</button>
              </div>
              {(metodo === "PAGO_MOVIL" || metodo === "PUNTO") && <input className="inp" inputMode="numeric" placeholder="Referencia (opcional)" value={refe} onChange={(e) => setRefe(e.target.value.replace(/\D/g, "").slice(0, 12))} aria-label="Referencia del abono" />}
              {m > 0 && mon === "VES" && <span className="hint t">= {usd(Math.round(mUsd * 100) / 100)} · le quedaría {usd(Math.max(0, Math.round((c.saldoUsd - mUsd) * 100) / 100))}</span>}
              {m > 0 && mon === "USD" && <span className="hint t">Le quedaría {usd(Math.max(0, Math.round((c.saldoUsd - m) * 100) / 100))}</span>}
              {err && <p className="pinmsg err">{err}</p>}
              <button className="btn primary big press" disabled={m <= 0 || enviando} onClick={abonar}>{enviando ? "Guardando…" : "Registrar abono"}</button>
            </div>
          )}
          {ok && <p className="pinmsg ok">{ok}</p>}

          <h3 className="h3">Movimientos</h3>
          {d.movimientos.length === 0 && <span className="hint">Sin movimientos todavía.</span>}
          <div className="cli-movs">
            {d.movimientos.map((x) => (
              <div key={x.id} className="cli-mov">
                <span className={"pill " + (x.tipo === "CARGO" ? "late" : "ok")}>{x.tipo === "CARGO" ? "Fiado" : "Abono"}</span>
                <span className="cli-mov-tx">{x.tipo === "CARGO" ? (x.ventaId ? "Venta #" + x.ventaId : "Venta") : (METODOS_ABONO.find((y) => y.id === x.metodo)?.n || ({ NOMINA: "Descontado del sueldo", ANULACION: "Venta anulada", DEVOLUCION: "Devolución" } as Record<string, string>)[x.metodo || ""] || x.metodo) + (x.moneda === "VES" && x.montoOriginal ? " · " + bs(x.montoOriginal) : "") + (x.referencia ? " · ref " + x.referencia : "")}
                  <small>{new Date(x.createdAt).toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</small></span>
                <b className={"t " + (x.tipo === "CARGO" ? "mg-bad" : "mg-ok")}>{x.tipo === "CARGO" ? "+" : "−"} {usd(x.montoUsd)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
      {editar && <FormCliente cliente={c} onClose={() => setEditar(false)} onSaved={() => { setEditar(false); cargar(); }} />}
    </div>
  );
}

/** Selector de cliente para cobrar con Fiado (buscar o anotar uno nuevo). */
export function ElegirCliente({ onElegir, onClose }: { onElegir: (c: ClienteFiado) => void; onClose: () => void }) {
  const [lista, setLista] = useState<ClienteFiado[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [nuevo, setNuevo] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { listarClientes().then(setLista).catch((e) => setErr((e as Error).message)); }, []);
  const f = q.trim().toLowerCase();
  const vis = lista.filter((c) => c.activo && (!f || c.nombre.toLowerCase().includes(f) || (c.cedula || "").toLowerCase().includes(f) || (c.telefono || "").includes(f)));
  const key = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, vis.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (vis[sel]) onElegir(vis[sel]); else if (q.trim()) setNuevo(true); }
  };
  if (nuevo) return <FormCliente nombreInicial={q.trim()} onClose={() => setNuevo(false)} onSaved={onElegir} />;
  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onKeyDown={key}>
        <div className="modal-head"><h2>¿A quién le fías?</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body">
          <label className="search">
            <UIcono k="search" sw={2} />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="Nombre, cédula o teléfono…" aria-label="Buscar cliente para fiar" />
          </label>
          {err && <p className="pinmsg err">{err}</p>}
          <div className="cli-pick">
            {vis.slice(0, 30).map((c, i) => (
              <button key={c.id} className={"cli-pick-row press" + (i === sel ? " sel" : "")} onClick={() => onElegir(c)}>
                <b>{c.nombre}{c.tipo === "TRABAJADOR" && <span className="pill info cli-badge">Trabajador</span>}</b><small>{c.cedula || c.telefono || ""}</small>
                <span className={"t " + (c.saldoUsd > 0 ? "mg-bad" : "")}>{c.saldoUsd > 0 ? "debe " + usd(c.saldoUsd) : "al día"}</span>
              </button>
            ))}
            {vis.length === 0 && <span className="hint">{lista.length ? "Nadie coincide." : "No hay clientes todavía."}</span>}
          </div>
        </div>
        <div className="modal-foot"><button className="btn2 big press" onClick={() => setNuevo(true)}><UIcono k="plus" sw={2.2} />Anotar cliente nuevo{q.trim() ? ": " + q.trim() : ""}</button></div>
      </div>
    </div>
  );
}
