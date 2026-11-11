import { useEffect } from "react";
import { UIcono } from "./icons";

// Ayuda de atajos de teclado (F1). La caja se puede usar completa sin mouse.

const GRUPOS: { t: string; items: [string, string][] }[] = [
  { t: "En toda la app", items: [["Alt + 1, 2, 3…", "Cambiar de pestaña"], ["F1", "Ver estos atajos"], ["Esc", "Cerrar ventana / volver"]] },
  { t: "Vender", items: [["Escribir / F2", "Buscar producto o leer código de barras"], ["Enter", "Agregar el producto resaltado"], ["↑ ↓", "Moverse entre los resultados"], ["+ / −", "Sumar o restar al último producto"], ["Supr", "Quitar el último producto"], ["F9 · Ctrl+Enter", "Cobrar"], ["F4", "Recarga de saldo (Movistar, Digitel, Movilnet…)"]] },
  { t: "Cobrar", items: [["Tab", "Pasar a la siguiente forma de pago"], ["F8", "Poner el resto en la casilla actual"], ["Enter", "Cobrar y listo"], ["Esc", "Volver al ticket"]] },
  { t: "Cierre de caja", items: [["Enter", "Pasar a la siguiente casilla"], ["F8", "Contar billetes (efectivo)"], ["Ctrl + Enter", "Cerrar el turno"], ["G · R · I · A", "Gasto · Retiro · Ingreso · Avance"]] },
  { t: "Fiado", items: [["Escribir", "Buscar cliente"], ["Enter", "Abrir el primero / registrar abono"], ["↑ ↓ (al cobrar)", "Elegir cliente"]] },
  { t: "Entrada (PIN)", items: [["← →", "Elegir cajero"], ["0 – 9", "Escribir el PIN"], ["Retroceso", "Borrar un dígito"]] },
];

export function Atajos({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "F1") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal atajos" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card atajos-card" role="dialog" aria-label="Atajos de teclado">
        <div className="modal-head"><h2><UIcono k="teclado" /> Atajos de teclado</h2><button className="ghost" onClick={onClose}>Cerrar</button></div>
        <div className="modal-body atajos-grid">
          {GRUPOS.map((g) => (
            <section key={g.t}>
              <h3 className="h3">{g.t}</h3>
              {g.items.map(([k, d]) => <div className="atajo" key={k}><kbd>{k}</kbd><span>{d}</span></div>)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
