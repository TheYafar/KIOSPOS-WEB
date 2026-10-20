import { useCallback, useEffect, useState } from "react";
import { cobrar, guardarConfig, leerConfig, sincronizar, type ConfigCaja } from "./api";
import { listar, type VentaEnCola } from "./outbox";

/**
 * Pantalla mínima de demostración del cobro offline (Paso 8). No es la UI final (esa
 * sale del mockup en design/mockup.html); aquí se prueba el mecanismo: cobrar guarda
 * en la cola y envía al servidor; sin internet, la venta espera y se sincroniza al
 * reconectar, sin cobrar dos veces (codigoUnico idempotente).
 */
export function App() {
  const [online, setOnline] = useState(navigator.onLine);
  const [cola, setCola] = useState<VentaEnCola[]>([]);
  const [cfg, setCfg] = useState<ConfigCaja>(leerConfig());
  const [msg, setMsg] = useState("");

  const refrescar = useCallback(async () => {
    setCola(await listar());
  }, []);

  const sync = useCallback(async () => {
    const r = await sincronizar();
    setMsg(`Enviadas: ${r.enviadas} · En cola: ${r.pendientes} · Con error: ${r.errores}`);
    await refrescar();
  }, [refrescar]);

  useEffect(() => {
    refrescar();
    const alConectar = () => {
      setOnline(true);
      sync();
    };
    const alDesconectar = () => setOnline(false);
    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);
    return () => {
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
    };
  }, [refrescar, sync]);

  const guardar = () => {
    guardarConfig(cfg);
    setMsg("Configuración guardada.");
  };

  const cobrarDemo = async () => {
    // Cobro rápido de $1 (sin producto de catálogo) para probar sin sembrar inventario.
    await cobrar(
      [{ productoId: null, cantidad: 1, precioUsd: 1, nombre: "Artículo demo" }],
      [{ metodo: "EFECTIVO_USD", moneda: "USD", montoOriginal: 1 }]
    );
    setMsg("Venta encolada (y enviada si hay internet).");
    await refrescar();
  };

  const campo = (k: keyof ConfigCaja, label: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
      {label}
      <input
        value={cfg[k]}
        onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })}
        style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
      />
    </label>
  );

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>KioskPOS — Caja (demo offline)</h1>

      <p style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: online ? "#1b8448" : "#c3372f"
          }}
        />
        {online ? "En línea" : "Sin conexión"}
      </p>

      <section style={{ display: "grid", gap: 10, margin: "12px 0" }}>
        {campo("token", "Token de caja (JWT)")}
        {campo("permiso", "Permiso de cobro (X-Permiso)")}
        {campo("tasaBcv", "Tasa BCV")}
        <button onClick={guardar} style={{ padding: 10, borderRadius: 8 }}>
          Guardar configuración
        </button>
      </section>

      <section style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button onClick={cobrarDemo} style={{ flex: 1, padding: 12, borderRadius: 10, fontWeight: 600 }}>
          Cobrar $1 (demo)
        </button>
        <button onClick={sync} style={{ flex: 1, padding: 12, borderRadius: 10 }}>
          Sincronizar
        </button>
      </section>

      {msg && <p style={{ fontSize: 13, color: "#555" }}>{msg}</p>}

      <h2 style={{ fontSize: 15 }}>Cola de envíos ({cola.length})</h2>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
        {cola.map((v) => (
          <li key={v.codigoUnico} style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, fontSize: 12 }}>
            <div style={{ fontFamily: "monospace" }}>{v.codigoUnico.slice(0, 18)}…</div>
            <div>
              estado: <b>{v.estado}</b> · intentos: {v.intentos}
              {v.ultimoError ? ` · ${v.ultimoError}` : ""}
            </div>
          </li>
        ))}
        {cola.length === 0 && <li style={{ color: "#999", fontSize: 13 }}>Vacía — todo sincronizado.</li>}
      </ul>
    </main>
  );
}
