import { useEffect, useState } from "react";
import { getConfigNegocio, putConfigNegocio } from "../api";

// ===== Horarios de cierre (editor reusable) =====
// value = "HH:mm,HH:mm,..." (comma-separated). onChange devuelve el mismo formato.
export function HorariosCierre({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const horas = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const set = (i: number, v: string) => { const a = [...horas]; a[i] = v; onChange(a.join(",")); };
  const add = () => onChange([...horas, "18:00"].join(","));
  const del = (i: number) => onChange(horas.filter((_, j) => j !== i).join(","));
  return (
    <div className="horarios">
      {horas.length === 0 && <span className="hint">Sin horarios. Agrega a qué hora se cierra la caja (ej. 3:00, 7:00, 10:00).</span>}
      {horas.map((h, i) => (
        <div className="horario-row" key={i}>
          <span className="n">Cierre {i + 1}</span>
          <input className="inp t" type="time" value={h} onChange={(e) => set(i, e.target.value)} />
          <button className="hdel" type="button" onClick={() => del(i)} aria-label="Quitar">✕</button>
        </div>
      ))}
      <button className="btn ghost hadd" type="button" onClick={add}>+ Agregar hora de cierre</button>
    </div>
  );
}

// ===== Ajustes del negocio (el dueño edita su perfil + horarios) =====
export function AjustesNegocio() {
  const [nombre, setNombre] = useState("");
  const [rif, setRif] = useState("");
  const [pie, setPie] = useState("");
  const [tel, setTel] = useState("");
  const [dir, setDir] = useState("");
  const [horarios, setHorarios] = useState("");
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    getConfigNegocio().then((c) => {
      setNombre(c.nombre || ""); setRif(c.rif || ""); setPie(c.mensajeTicket || "");
      setTel(c.telefono || ""); setDir(c.direccion || ""); setHorarios(c.horariosCierre || "");
    }).catch((e) => setErr((e as Error).message)).finally(() => setCargando(false));
  }, []);

  const guardar = async () => {
    try {
      await putConfigNegocio({ nombre: nombre.trim(), rif: rif.trim(), mensajeTicket: pie.trim(), telefono: tel.trim(), direccion: dir.trim(), horariosCierre: horarios });
      setMsg("Guardado ✓"); setErr("");
      setTimeout(() => setMsg(""), 2500);
    } catch (e) { setErr((e as Error).message); }
  };

  if (cargando) return <div className="cb-loading">Cargando ajustes…</div>;

  return (
    <section className="aj">
      <div className="aj-head"><b>Ajustes del negocio</b><span>Tus datos (salen en el ticket) y a qué hora se cierra la caja.</span></div>
      <label className="lbl">Nombre del negocio<input className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Bodega Cocoa" maxLength={150} /></label>
      <label className="lbl">RIF<input className="inp" value={rif} onChange={(e) => setRif(e.target.value)} placeholder="Ej: J-12345678-9 (opcional)" maxLength={30} /></label>
      <label className="lbl">Teléfono<input className="inp" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Ej: 0412-1234567" /></label>
      <label className="lbl">Dirección / local<input className="inp" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="Dónde queda la bodega" /></label>
      <label className="lbl">Mensaje al pie del ticket<input className="inp" value={pie} onChange={(e) => setPie(e.target.value)} placeholder="Gracias por su compra. Vuelva pronto." maxLength={200} /></label>
      <div className="lbl"><span>Así sale el ticket</span><pre className="aj-ticket t" aria-label="Vista del ticket">{vistaTicket(nombre, rif, dir, tel, pie)}</pre></div>
      <div className="lbl"><span>Horarios de cierre de caja</span><HorariosCierre value={horarios} onChange={setHorarios} /></div>
      {err && <p className="pinmsg err">{err}</p>}
      {msg && <span className="pill ok" style={{ alignSelf: "flex-start" }}>{msg}</span>}
      <button className="btn primary" onClick={guardar}>Guardar ajustes</button>
    </section>
  );
}

/** Encabezado y pie del ticket de 40 columnas, igual que TicketService del servidor. */
export function vistaTicket(nombre: string, rif: string, dir: string, tel: string, pie: string): string {
  const W = 40;
  const cen = (t: string) => (t.length >= W ? t.slice(0, W) : " ".repeat(Math.floor((W - t.length) / 2)) + t);
  const env = (t: string) => {
    const out: string[] = []; let a = "";
    for (let w of t.replace(/\s+/g, " ").trim().split(" ")) {
      if (a && a.length + 1 + w.length > W) { out.push(a); a = ""; }
      while (w.length > W) { out.push(w.slice(0, W)); w = w.slice(W); }
      a = a ? a + " " + w : w;
    }
    if (a || !out.length) out.push(a);
    return out;
  };
  const l: string[] = env((nombre || "Mi bodega").toUpperCase()).map(cen);
  if (rif.trim()) l.push(cen("RIF: " + rif.trim()));
  if (dir.trim()) l.push(...env(dir).map(cen));
  if (tel.trim()) l.push(cen("Tel: " + tel.trim()));
  l.push("-".repeat(W), "TICKET # 000123", "1 x Harina PAN" + " ".repeat(15) + "Bs. 900,00", "-".repeat(W));
  l.push(...env(pie.trim() || "Gracias por su compra. Vuelva pronto.").map(cen));
  return l.join("\n");
}

// ===== Aviso de cierre para el CAJERO en la caja =====
export type Aviso = { tipo: "pronto" | "ahora"; hora: string; minutos: number };

/** Dado "HH:mm,HH:mm" y la hora actual, devuelve el aviso de cierre más urgente o null.
 *  "pronto" = faltan 1..20 min; "ahora" = ya es la hora (hasta 30 min después). */
export function avisoCierre(horarios: string | null | undefined, now: Date): Aviso | null {
  if (!horarios) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let mejor: Aviso | null = null;
  for (const raw of horarios.split(",")) {
    const s = raw.trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const closeMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const diff = closeMin - nowMin;
    let cand: Aviso | null = null;
    if (diff > 0 && diff <= 20) cand = { tipo: "pronto", hora: s, minutos: diff };
    else if (diff <= 0 && diff >= -30) cand = { tipo: "ahora", hora: s, minutos: Math.abs(diff) };
    if (cand) {
      const mejorAhora = mejor && mejor.tipo === "ahora";
      const candMejor = !mejor
        || (cand.tipo === "ahora" && !mejorAhora)
        || (cand.tipo === mejor.tipo && cand.minutos < mejor.minutos);
      if (candMejor) mejor = cand;
    }
  }
  return mejor;
}

function hora12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ":" + String(m).padStart(2, "0") + " " + ap;
}

const Campana = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export function CierreAviso() {
  const [horarios, setHorarios] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [cerrado, setCerrado] = useState("");

  useEffect(() => { getConfigNegocio().then((c) => setHorarios(c.horariosCierre)).catch(() => {}); }, []);
  useEffect(() => {
    const tick = () => setAviso(avisoCierre(horarios, new Date()));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [horarios]);

  if (!aviso) return null;
  const clave = aviso.tipo + aviso.hora;
  if (cerrado === clave) return null;

  return (
    <div className={"cierre-aviso " + aviso.tipo}>
      <span className="ca-ic"><Campana /></span>
      <span className="ca-txt">
        {aviso.tipo === "pronto"
          ? <>Faltan <b>{aviso.minutos} min</b> para el cierre de las <b>{hora12(aviso.hora)}</b>. Ve preparando la caja.</>
          : <><b>Es hora de cerrar la caja</b> (cierre de las {hora12(aviso.hora)}). Ve a <b>Cierre</b> para cuadrar.</>}
      </span>
      <button className="ca-x" onClick={() => setCerrado(clave)} aria-label="Cerrar aviso">✕</button>
    </div>
  );
}
