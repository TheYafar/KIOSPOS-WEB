import { useCallback, useEffect, useState } from "react";
import { renovarPermiso, sincronizar, tasaBcvServidor } from "./api";
import { cerrarSesion, getSesion, setTasa, type Sesion } from "./session";
import { getBcv, setBcv, tasaEfectiva } from "./config";
import { Login } from "./screens/Login";
import { Shell } from "./screens/Shell";
import { SuperAdmin } from "./screens/SuperAdmin";

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(getSesion());
  const [, setTick] = useState(0); // fuerza re-render al llegar la tasa nueva

  const salir = useCallback(() => {
    cerrarSesion();
    setSesion(null);
  }, []);

  // Tasa BCV automática: el servidor la trae del BCV; la refrescamos al abrir,
  // cada hora y al reconectar. Si falla, se mantiene la última conocida.
  useEffect(() => {
    let vivo = true;
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
    return <SuperAdmin onSalir={salir} />;
  }
  return <Shell sesion={sesion} onSalir={salir} />;
}
