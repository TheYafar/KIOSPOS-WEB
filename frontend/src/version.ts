// Versión nueva de la app: el service worker baja la actualización en segundo plano, pero
// la pantalla abierta seguía con la vieja hasta cerrar todo. Aquí:
//  - se busca actualización al abrir, al volver a la app y cada 15 min;
//  - cuando la versión nueva toma el control: si NO hay sesión (pantalla de entrada) se
//    recarga sola; si hay sesión (puede haber un cobro a medias) sale un aviso con
//    "Actualizar" para que la persona elija el momento.
import { getSesion } from "./session";

export function vigilarVersion() {
  if (!("serviceWorker" in navigator)) return;
  const habiaVersion = !!navigator.serviceWorker.controller; // la 1ra instalación no cuenta
  let listo = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!habiaVersion || listo) return;
    listo = true;
    if (!getSesion()) { window.location.reload(); return; }
    mostrarAviso();
  });

  const buscar = () => { navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {}); };
  window.addEventListener("load", buscar);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") buscar(); });
  window.setInterval(buscar, 15 * 60 * 1000);
}

function mostrarAviso() {
  if (document.getElementById("kp-version")) return;
  const d = document.createElement("div");
  d.id = "kp-version";
  d.className = "kp-version";
  d.setAttribute("role", "status");
  d.innerHTML = '<span>Hay una versión nueva de KioskPOS</span>';
  const b = document.createElement("button");
  b.textContent = "Actualizar";
  b.onclick = () => window.location.reload();
  const x = document.createElement("button");
  x.className = "kp-version-x"; x.setAttribute("aria-label", "Después"); x.textContent = "Después";
  x.onclick = () => d.remove();
  d.append(b, x);
  document.body.appendChild(d);
}
