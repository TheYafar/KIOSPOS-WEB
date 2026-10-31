# Diseño — Módulo Contable (panel del dueño)

Fecha: 2026-10-31 · Dueño del producto: uriel
Proyecto: KioskPOS Web · Prioridad: P2 · Relacionado: [[nómina]] (los pagos de nómina son un egreso aquí)

## Intención y el porqué

El dueño quiere ver **cuánto entra, cuánto sale y qué le queda**, y partir ese sobrante en
**cuánto puede reinvertir en reponer mercancía** y **cuánto le queda limpio en el bolsillo**.
Hoy la app solo muestra las ventas/ganancia del día; no hay dónde juntar los gastos (nómina,
servicios, internet, alquiler…) ni ver el resultado neto.

Pedido explícito del dueño (brainstorming 2026-10-31): dos modos de trabajar —
**automático** (la app calcula con sus fórmulas desde los datos reales) y **manual** (el dueño
lleva todo a mano). Su razón para el manual: que si hay un error, **sea del dueño y no de la
app** — por eso en manual la app no calcula nada, solo guarda lo que él escribe.

## Objetivos (goals)

- **Contabilidad automática:** un tablero por período (día / semana / mes / rango) que calcula
  solo:
  - **Entró** = ganancia de ventas (ventas − costo de lo vendido), de datos que ya existen.
  - **Salió** = nómina pagada (viene del módulo Nómina) + servicios/otros gastos que el dueño
    anota.
  - **Queda** = entró − salió.
  - **Reparto** del sobrante en **"para mercancía"** y **"para tu bolsillo"**.
  - **Comparar** un período con el anterior.
- **Mi libro (manual):** una libreta en blanco; el dueño escribe líneas (fecha, concepto,
  ingreso/egreso, monto) y la app **solo guarda y suma**. No mete ningún número automático.
- Secciones nuevas en el panel del dueño, con claro/oscuro.

## No-objetivos (non-goals)

- El libro manual **no** jala datos del sistema (por diseño: el error debe ser del dueño, no
  de la app).
- No es contabilidad fiscal, ni impuestos, ni estados financieros formales.
- Las **compras/facturas de compra** formales son un módulo aparte (P2). Aquí "para mercancía"
  es un **presupuesto sugerido**, no el registro de una compra (ver "A confirmar").

## Anti-objetivos (fracaso aunque "funcione")

- Que en **Mi libro** se cuele un número calculado por la app.
- Que un negocio vea la contabilidad de **otro** (romper RLS).
- Que la **nómina se cuente doble**: debe venir solo del módulo Nómina, no reescribirse aquí.

## Restricciones

- **Multi-tenant con RLS** en toda tabla nueva (`negocio_id` de la sesión, policy `FORCE`).
- **Moneda:** base en **$**; Bs se muestra por tasa BCV. (Catálogo y nómina ya son en $.)
- **Reusar** `ReporteService` (la ganancia ya se calcula; se extiende a rangos de fechas) y
  los **pagos del módulo Nómina** como fuente del egreso de nómina.
- **Solo el dueño** entra a este módulo (dato sensible; ver "A confirmar").
- Idioma **es-VE**.

## Enfoques considerados (se eligió 2)

**1 — Un solo libro con interruptor.** Una pantalla de ingresos/egresos; en automático la app
agrega líneas de ventas/nómina (marcadas "calculadas"), en manual se apagan y todo lo escribe
el dueño.
- A favor: una sola cosa que mantener.
- En contra: números de la app y del dueño conviven en la misma pantalla; alto riesgo de que en
  manual se cuele un cálculo de la app — justo lo que el dueño no quiere.

**2 — Dos secciones separadas** ✅ **ELEGIDO**
- **Contabilidad automática:** tablero calculado desde ventas + nómina + gastos anotados.
- **Mi libro (manual):** libreta en blanco, totalmente aparte; la app solo guarda y suma.
- A favor: el libro manual queda **intocable por la app** — calza exacto con la intención del
  dueño.
- En contra: son dos cosas que construir (el libro manual es simple).

**Por qué 2:** aislar el modo manual es el requisito, no un detalle; con la opción 1 no se puede
garantizar.

## El "cómo" ya decidido

### Modelo de datos (migración **V8__contabilidad.sql**, con RLS)

- **`conta_gastos`** — gastos que el dueño anota para el modo **automático**:
  `id, negocio_id, fecha, categoria ('SERVICIOS'|'INTERNET'|'ALQUILER'|'OTRO'), concepto,
  monto_usd NUMERIC(12,2), created_by, created_at`. (La nómina **no** se guarda aquí; se lee
  del módulo Nómina para no duplicar.)
- **`conta_libro`** — líneas del **libro manual**, nada derivado:
  `id, negocio_id, fecha, concepto, tipo ('INGRESO'|'EGRESO'), monto_usd, created_by,
  created_at`.
- **`conta_config`** — ajustes del modo automático por negocio:
  `negocio_id (PK), reparto_mercancia_pct NUMERIC(5,2)` (ver "A confirmar" #1).

### Cálculo del modo automático

Para el período elegido:
- `entro = ganancia de ventas del rango` (ReporteService extendido a `desde/hasta`).
- `salio = Σ pagos de nómina del rango + Σ conta_gastos del rango`.
- `queda = entro − salio`.
- `mercancia = queda × reparto_mercancia_pct`; `bolsillo = queda − mercancia`.
- Comparación: mismo cálculo sobre el período inmediatamente anterior, y la diferencia.

### Cálculo del modo manual

- Suma simple: `ingresos = Σ líneas INGRESO`, `egresos = Σ líneas EGRESO`,
  `saldo = ingresos − egresos`. La app **no** aporta ninguna línea.

### API (solo dueño)

- `GET  /api/contabilidad/resumen?desde=&hasta=` — entró, salió (desglosado: nómina /
  servicios / otros), queda, reparto, y comparación con el período anterior.
- `GET/POST/PUT/DELETE /api/contabilidad/gastos` — gastos anotados del modo automático.
- `GET/PUT /api/contabilidad/config` — porcentaje de reparto.
- `GET/POST/PUT/DELETE /api/contabilidad/libro` — líneas del libro manual.

### Frontend (panel del dueño)

- Dos entradas nuevas en el menú del dueño: **"Contabilidad"** (automática) y **"Mi libro"**.
- **Contabilidad automática:** selector de período; tarjetas **Entró / Salió / Queda**;
  desglose de egresos (nómina, servicios, otros); el **reparto** mercancía/bolsillo; comparación
  con el período anterior.
- **Mi libro:** tabla de líneas editable + totales (ingresos, egresos, saldo); botón "Agregar
  línea". Un aviso sutil de que esta sección es 100% manual.
- Tema claro/oscuro con tokens (sin colores fijos), como el resto.

## Qué queda a criterio del constructor (builder)

- Nombres exactos de tablas/columnas, repos/servicios, policy RLS calcada de V5/V6, y la
  extensión de `ReporteService` a rangos de fecha (hoy es por día).
- Número de migración (se asume **V8**).
- Lista corta de categorías de gasto (editable).
- Período por defecto del tablero: **mes en curso**.
- Pruebas: aislamiento multi-tenant + cálculo del resumen (entró/salió/queda/reparto) + que el
  libro manual no mezcla datos del sistema, al estilo de las pruebas existentes.

## A confirmar con el dueño (preguntas abiertas)

1. **Reparto mercancía/bolsillo (modo automático):** ¿una **regla fija** que tú configuras (ej.
   "40% a mercancía, el resto a mí") o la app **solo muestra el sobrante** y tú lo repartes a
   ojo cada vez?
2. **"Para mercancía":** ¿es solo un **presupuesto sugerido** (no toca inventario ni registra la
   compra) — lo que propongo para v1 — o quieres que cuando compres mercancía se vaya
   descontando de ahí?
3. **Acceso:** ¿solo el **dueño** ve la contabilidad (lo propuesto)?
