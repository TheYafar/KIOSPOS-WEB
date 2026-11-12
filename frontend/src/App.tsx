import { useCallback, useEffect, useState } from "react";
import { getCajaConfig, renovarPermiso, sincronizar, tasaBcvServidor } from "./api";
import { cerrarSesion, getSesion, getTasa, setTasa, type Sesion } from "./session";
import { aplicarDelServidor, getBcv, setBcv, tasaEfectiva } from "./config";
import { Login } from "./screens/Login";
import { Shell } from "./screens/Shell";
import { SuperAdmin } from "./screens/SuperAdmin";

/** Un enlace de emparejar caja (#caja=) o de clave nueva (#reset=) debe llevar SIEMPRE a la
 *  pantalla de entrada: si no, estando logueado el link "no hace nada". */
const linkDeEntrada = typeof window !== "undefined" && /(?:^|[#&])(?:caja|reset)=/.test(window.location.hash);

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(linkDeEntrada ? null : getSesion());
  const [, setTick] = useState(0); // fuerza re-render al llegar la tasa nueva

  // Si el link llegó con sesión abierta: la cerramos (sin borrar el hash) para que Login lo lea.
  useEffect(() => { if (linkDeEntrada && getSesion()) cerrarSesion(); }, []);

  const salir = useCallback(() => {
    cerrarSesion();
    setSesion(null);
    // Sin la pestaña en la URL: el próximo que entre arranca en su primera pestaña.
    try { history.replaceState(null, "", window.location.pathname); } catch { /* ignore */ }
  }, []);

  // El servidor dijo que la sesión venció: volver a la entrada con un aviso.
  useEffect(() => {
    const vencida = () => {
      if (!getSesion()) return;
      try { sessionStorage.setItem("kp_aviso_login", "Tu sesión venció. Entra otra vez."); } catch { /* */ }
      salir();
    };
    window.addEventListener("kp-sesion-vencida", vencida);
    return () => window.removeEventListener("kp-sesion-vencida", vencida);
  }, [salir]);

  // Tasa BCV automática: el servidor la trae del BCV; la refrescamos al abrir,
  // cada hora y al reconectar. Si falla, se mantiene la última conocida.
  useEffect(() => {
    let vivo = true;
    // Sin BCV del servidor todavía: la última tasa del equipo sirve de base para los ajustes.
    if (!getBcv()) { const t = Number(getTasa()); if (t > 0) setBcv(t, false); }
    const sync = async () => {
      try {
        const t = await tasaBcvServidor();
        if (vivo && t.bs) { setBcv(t.bs); setTasa(String(tasaEfectiva(t.bs))); setTick((x) => x + 1); }
      } catch { /* sin conexión: se mantiene la última tasa */ }
    };
    sync();
    const id = setInterval(sync, 60 * 60 * 1000);
    window.addEventListener("online", sync);
    // Si cambian la configuración (aumento/tasa manual), se recalcula al instante.
    const onCfg = () => { const e = tasaEfectiva(getBcv()); if (e > 0) setTasa(String(e)); setTick((x) => x + 1); };
    window.addEventListener("kp-config", onCfg);
    return () => { vivo = false; clearInterval(id); window.removeEventListener("online", sync); window.removeEventListener("kp-config", onCfg); };
  }, []);

  // Con sesión: la config de caja (formas de pago + tasa) la manda el servidor.
  // Se trae al entrar, cada 15 min y al reconectar; sin internet queda la copia del equipo.
  useEffect(() => {
    if (!sesion || sesion.rol === "SUPER_ADMIN") return;
    let vivo = true;
    const traer = () => getCajaConfig().then((r) => {
      if (!vivo) return;
      const e = aplicarDelServidor(r);
      if (e > 0) setTasa(String(e));
      setTick((x) => x + 1);
    }).catch(() => { /* sin conexión: copia del equipo */ });
    traer();
    const id = setInterval(traer, 15 * 60 * 1000);
    window.addEventListener("online", traer);
    window.addEventListener("kp-config-recargar", traer);
    return () => { vivo = false; clearInterval(id); window.removeEventListener("online", traer); window.removeEventListener("kp-config-recargar", traer); };
  }, [sesion]);

  // Al entrar una caja: renueva el permiso cada pocos minutos y sincroniza la cola.
  useEffect(() => {
    if (!sesion || sesion.cajaId == null) {
      return;
    }
    renovarPermiso();
    sincronizar();
    const t = setInterval(() => {
      renovarPermiso();
      sincronizar();
    }, 4 * 60 * 1000);
    const alConectar = () => {
      renovarPermiso();
      sincronizar();
    };
    window.addEventListener("online", alConectar);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", alConectar);
    };
  }, [sesion]);

  if (!sesion) {
    return <Login onLogin={setSesion} />;
  }
  if (sesion.rol === "SUPER_ADMIN") {
    return <SuperAdmin onSalir={salir} onEntrarNegocio={setSesion} />;
  }
  return <Shell sesion={sesion} onSalir={salir} />;
}
