import { useEffect } from "react";
import { UIcono } from "../icons";
import { AyudaWhatsApp } from "./Ayuda";

// Guía de módulos: un botón al lado de la pantalla que explica, en palabras simples,
// para qué sirve cada sección y deja ir directo. Marca dónde estás.

const QUE_HACE: Record<string, string> = {
  reportes: "Tu resumen: cuánto vendiste y cuánto ganaste hoy, en la semana o el mes, lo más vendido y lo que se está agotando. Arriba ves tus cajeros y tus cajas.",
  ventas: "El historial de ventas. Busca una venta por su número de factura, mira qué se llevó y cómo pagó, reimprime el ticket, anúlala o devuelve productos.",
  inventario: "Tu mercancía: crea productos, cambia precios, ajusta existencias, vende por caja, media caja o por kilo, e importa o exporta en Excel. En «Compras» cargas las facturas de tus proveedores y lo que les debes.",
  contabilidad: "Tus cuentas, sin enredos: lo que entró y lo que te quedó, cierre por cierre, y una libreta para anotar gastos y entradas a mano.",
  fiado: "Quién te debe y cuánto, clientes y trabajadores. Toca «Abonar» para recibir un pago (efectivo $, efectivo Bs, pago móvil, punto o Biopago) o entra a su cuenta para darle a crédito.",
  nomina: "Paga a tus trabajadores: sueldo, bonos y adelantos, y se descuenta solo lo que deben de crédito. Te da un recibo para imprimir.",
  config: "Cómo cobras: formas de pago, tasa del dólar, comisiones de recargas y avances, y en qué impresora sale el ticket.",
  puntos: "Todos los cierres: los de caja (quién, a qué hora y si cuadró) y los tickets de cierre del punto y del Biopago, por día y por caja.",
  mas: "Tu plan y tus pagos, los datos de tu bodega para el ticket, tu equipo (cajeros y encargados), tus cajas y la seguridad de tu cuenta.",
  caja: "La caja: busca o escanea productos, agrega recargas y avances, y cobra en $, Bs, pago móvil, punto, Biopago o a crédito. Con F1 ves los atajos de teclado.",
  cuadre: "Abre y cierra tu turno: cuenta el efectivo, anota gastos, retiros y los tickets del punto y del Biopago, y ve si la caja cuadró.",
};
const QUE_HACE_CAJA: Record<string, string> = {
  ventas: "Las ventas de tu turno: busca por número de factura, reimprime el ticket, anula una venta o devuelve productos.",
};

interface Tab { id: string; n: string; icon: string; }

/** Botón para abrir la guía. `lado`: pestaña pegada al borde (PC/tablet); si no, el "?" del encabezado (teléfono). */
export function GuiaBoton({ lado, onClick }: { lado?: boolean; onClick: () => void }) {
  return lado
    ? <button className="guia-lado press" onClick={onClick} aria-label="Guía: qué hace cada módulo" title="Qué hace cada módulo"><span className="guia-q">?</span><span className="guia-tx">Guía</span></button>
    : <button className="tema-btn press guia-hdr" onClick={onClick} aria-label="Guía: qué hace cada módulo" title="Qué hace cada módulo"><span className="guia-q">?</span></button>;
}

export function GuiaPanel({ tabs, actual, esCaja, onIr, onCerrar }: { tabs: Tab[]; actual: string; esCaja: boolean; onIr: (id: string) => void; onCerrar: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onCerrar(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCerrar]);
  const texto = (id: string) => (esCaja && QUE_HACE_CAJA[id]) || QUE_HACE[id] || "";
  const aqui = tabs.find((t) => t.id === actual);
  return (
    <div className="guia-fondo" onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <aside className="guia-panel" role="dialog" aria-label="Guía de módulos">
        <div className="guia-h"><b>¿Qué hace cada parte?</b><button className="ghost" onClick={onCerrar}>Cerrar</button></div>
        {aqui && (
          <div className="guia-aqui">
            <span className="guia-ic"><UIcono k={aqui.icon} sw={1.9} /></span>
            <div><small>Estás en</small><b>{aqui.n}</b><p>{texto(aqui.id)}</p></div>
          </div>
        )}
        <div className="guia-lista">
          {tabs.filter((t) => t.id !== actual).map((t) => (
            <div className="guia-item" key={t.id}>
              <span className="guia-ic"><UIcono k={t.icon} sw={1.9} /></span>
              <div className="guia-item-tx"><b>{t.n}</b><p>{texto(t.id)}</p></div>
              <button className="btn2 sm press" onClick={() => { onIr(t.id); onCerrar(); }} aria-label={"Ir a " + t.n}>Ir aquí</button>
            </div>
          ))}
        </div>
        <div className="guia-pie"><AyudaWhatsApp texto="¿Te perdiste? Escríbenos por WhatsApp y te ayudamos" mensaje="Hola, tengo una duda sobre cómo usar KioskPOS." /></div>
      </aside>
    </div>
  );
}
