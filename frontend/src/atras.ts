import { useEffect, useRef } from "react";

/**
 * Botón "Atrás" (del teléfono o del navegador) que se porta como en una app:
 * si hay una ventana abierta, la cierra; si no, vuelve a la pestaña anterior
 * (eso lo hace Shell con la URL #/pestaña).
 *
 * Las ventanas se detectan solas: cualquier `.modal` u `.overlay` que aparezca en
 * la página suma una entrada al historial, y al tocar Atrás se cierra la de
 * arriba "tocando el fondo" (todas cierran con clic en su fondo). Las vistas que
 * no son ventanas (el cobro de la Caja) se registran con `useAtras`.
 */

type Capa = { el?: Element; cerrar?: () => void };

const explicitas: Array<() => void> = [];
let capas: Capa[] = [];
let empujadas = 0; // entradas de historial nuestras que siguen vivas
let ignorar = 0;   // "atrás" que provocamos nosotros al cerrar una ventana con su botón

function sincronizar() {
  const vivas = Array.from(document.querySelectorAll(".modal, .overlay"));
  capas = capas.filter((c) => (c.el ? vivas.includes(c.el) : explicitas.includes(c.cerrar!)));
  for (const el of vivas) if (!capas.some((c) => c.el === el)) capas.push({ el });
  for (const f of explicitas) if (!capas.some((c) => c.cerrar === f)) capas.push({ cerrar: f });
  const n = capas.length;
  if (n > empujadas) {
    for (let i = empujadas; i < n; i++) history.pushState({ kpCapa: true }, "", location.href);
    empujadas = n;
  } else if (n < empujadas) {
    // Se cerró con su propio botón: quitamos del historial la entrada que habíamos puesto.
    const d = empujadas - n;
    empujadas = n;
    ignorar += 1;
    history.go(-d);
  }
}

let pendiente = false;
function programar() {
  if (pendiente) return;
  pendiente = true;
  queueMicrotask(() => { pendiente = false; sincronizar(); });
}

if (typeof window !== "undefined" && typeof MutationObserver !== "undefined") {
  // En captura y registrado primero: decide antes que el cambio de pestaña de Shell.
  window.addEventListener("popstate", (e) => {
    if (ignorar > 0) { ignorar -= 1; e.stopImmediatePropagation(); return; }
    const c = capas.pop();
    if (!c) return; // no hay ventanas: que Shell cambie de pestaña
    empujadas = Math.max(0, empujadas - 1);
    e.stopImmediatePropagation();
    if (c.el) c.el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    else c.cerrar!();
    // Si esa ventana no se deja cerrar así, vuelve a quedar registrada.
    setTimeout(sincronizar, 0);
  }, true);
  const iniciar = () => new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
  if (document.body) iniciar(); else window.addEventListener("DOMContentLoaded", iniciar);
}

/** Mientras `abierto` sea true, Atrás llama a `cerrar` en vez de salir de la pantalla. */
export function useAtras(abierto: boolean, cerrar: () => void) {
  const ref = useRef(cerrar);
  ref.current = cerrar;
  useEffect(() => {
    if (!abierto) return;
    const f = () => ref.current();
    explicitas.push(f);
    sincronizar();
    return () => {
      const i = explicitas.indexOf(f);
      if (i >= 0) explicitas.splice(i, 1);
      programar();
    };
  }, [abierto]);
}
