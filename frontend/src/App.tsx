import { useCallback, useEffect, useState } from "react";
import { renovarPermiso, sincronizar } from "./api";
import { cerrarSesion, getSesion, type Sesion } from "./session";
import { Login } from "./screens/Login";
import { Shell } from "./screens/Shell";
import { SuperAdmin } from "./screens/SuperAdmin";

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(getSesion());

  const salir = useCallback(() => {
    cerrarSesion();
    setSesion(null);
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
