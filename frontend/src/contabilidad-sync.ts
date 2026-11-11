import { useEffect, useRef, useState } from "react";
import { ConflictoDoc, guardarDocContab, leerDocContab } from "./api";

/**
 * Sincroniza un documento de Cuentas ("libro" u "hojas") con el servidor. El equipo guarda
 * siempre una copia local (sirve sin internet) y la sube 1,5 s después del último cambio.
 *  - Al abrir: si quedaron cambios sin subir, los sube; si no, toma lo del servidor.
 *  - Si otro equipo guardó antes (409), se toma lo del servidor y se avisa.
 *  - Sin conexión: queda "pendiente" y se reintenta al volver el internet.
 */
export type EstadoSync = "cargando" | "guardado" | "guardando" | "pendiente" | "actualizado" | "error";

const kVer = (c: string) => "kioskpos.contab." + c + ".ver";
const kPend = (c: string) => "kioskpos.contab." + c + ".pend";
const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export function useDocServidor<T>(clave: "libro" | "hojas", valor: T, aplicar: (v: T) => void, valido: (v: unknown) => v is T): EstadoSync {
  const [estado, setEstado] = useState<EstadoSync>("cargando");
  const version = useRef<number>(Number(leer(kVer(clave)) || 0));
  const listo = useRef(false);
  const ultimo = useRef<string>(JSON.stringify(valor));
  const timer = useRef<number | undefined>(undefined);

  const subir = async (contenido: string) => {
    setEstado("guardando");
    try {
      const d = await guardarDocContab(clave, contenido, version.current);
      version.current = d.version; escribir(kVer(clave), String(d.version)); escribir(kPend(clave), null);
      setEstado("guardado");
    } catch (e) {
      if (e instanceof ConflictoDoc) {
        escribir(kPend(clave), null);
        if (e.actual) tomar(e.actual.contenido, e.actual.version);
        else { version.current = 0; escribir(kVer(clave), "0"); }
        setEstado("actualizado");
      } else {
        escribir(kPend(clave), "1");
        setEstado(navigator.onLine ? "error" : "pendiente");
      }
    }
  };
  const tomar = (contenido: string, ver: number) => {
    try {
      const v = JSON.parse(contenido);
      if (valido(v)) { ultimo.current = contenido; aplicar(v); }
    } catch { /* contenido dañado: se ignora */ }
    version.current = ver; escribir(kVer(clave), String(ver));
  };

  // Al abrir: subir lo pendiente o traer lo del servidor.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await leerDocContab(clave);
        if (!vivo) return;
        if (leer(kPend(clave)) === "1") {
          if (d) version.current = Math.min(version.current, d.version);
          listo.current = true; await subir(ultimo.current); return;
        }
        if (d) { tomar(d.contenido, d.version); setEstado("guardado"); }
        else { version.current = 0; listo.current = true; await subir(ultimo.current); return; } // primera vez: sube lo que tenía el equipo
      } catch {
        if (vivo) setEstado(leer(kPend(clave)) === "1" ? "pendiente" : "error");
      }
      listo.current = true;
    })();
    const alVolver = () => { if (leer(kPend(clave)) === "1") subir(ultimo.current); };
    window.addEventListener("online", alVolver);
    return () => { vivo = false; window.removeEventListener("online", alVolver); window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Cada cambio: marcar pendiente y subir tras una pausa.
  useEffect(() => {
    const txt = JSON.stringify(valor);
    if (txt === ultimo.current) return;
    ultimo.current = txt;
    if (!listo.current) return;
    escribir(kPend(clave), "1");
    setEstado("pendiente");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => subir(txt), 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return estado;
}

export const TEXTO_SYNC: Record<EstadoSync, string> = {
  cargando: "Buscando lo guardado…",
  guardado: "Guardado en tu cuenta ✓",
  guardando: "Guardando…",
  pendiente: "Sin enviar: se guarda al volver el internet",
  actualizado: "Se actualizó con lo de otro equipo",
  error: "No se pudo guardar en el servidor (queda en este equipo)",
};
