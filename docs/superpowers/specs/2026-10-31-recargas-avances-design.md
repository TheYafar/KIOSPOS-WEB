# Diseño — Recargas y Avances (operación de caja)

Fecha: 2026-10-31 · Dueño del producto: uriel
Proyecto: KioskPOS Web · Prioridad: P2 (Cocoa los usa a diario, CLAUDE.md §6) ·
Relacionado: [[contabilidad]] (la comisión es un ingreso), cuadre de caja.

## Intención y el porqué

Bodegas Cocoa hace **recargas y avances a diario**; sin esto no puede dejar el desktop. Es una
**operación del cajero en la caja** (no del panel del dueño): entra plata digital, sale efectivo,
y la bodega gana una **comisión**. Hoy la app solo sabe vender productos; no hay forma de
registrar estas operaciones, y si no se registran el **cuadre de caja queda descuadrado**
(falta efectivo en la gaveta sin explicación).

Decidido en brainstorming (2026-10-31): se hace **Recargas y Avances** y **Devoluciones**; **no**
se hace fiado de clientes. La comisión es **configurable** porque cada bodega pone su propio %.

## Objetivos (goals)

- Nueva **operación de caja** con tipo **AVANCE** o **RECARGA**, atada al **turno abierto** de la
  caja (como las ventas).
- **Avance** — entra digital, sale **efectivo**:
  - **Forma 1:** el cliente paga por un **método que el negocio tiene** (punto, pago móvil,
    biopago…) y el cajero entrega el efectivo.
  - **Forma 2:** el cliente hace un **pago móvil a una cuenta que el negocio indica**, y el
    cajero entrega el efectivo.
- **Recarga** — recarga telefónica / de un servicio (internet, etc.): el cliente paga y se
  registra la recarga a su línea o servicio.
- **Comisión configurable** por negocio (un % por defecto), que el **cajero puede ajustar** en el
  momento.
- Se engancha al **cuadre**: sube lo digital recibido, **baja el efectivo entregado**, y la
  comisión queda registrada como lo que se ganó (alimenta Contabilidad).

## No-objetivos (non-goals)

- **No** se conecta con operadoras/APIs de recarga en v1: la recarga la hace el cajero por su
  medio de siempre y la app **la registra** (ver "A confirmar").
- No fiado de clientes.
- No cambia el flujo de venta de productos.

## Anti-objetivos (fracaso aunque "funcione")

- Que un avance **no reste el efectivo** en el cuadre → arqueo descuadrado (el problema que
  justamente venimos a resolver).
- Contar la **comisión dos veces** (como ingreso y además dentro de la venta).
- Que un negocio vea operaciones de **otro** (romper RLS).

## Restricciones

- **RLS** multi-tenant; requiere **turno abierto** (igual que las ventas).
- **Permiso de cobro** (kill switch) vigente, como las ventas: es cobrar (ver "A confirmar").
- Reusar los **métodos de pago** existentes (EFECTIVO_USD, EFECTIVO_BS, PUNTO, PAGO_MOVIL,
  BIOPAGO) y el **CuadreService** (turnos + `esperado = fondo + efectivo cobrado − vuelto`).
- Moneda: el efectivo del avance es en **Bs** (ver "A confirmar" sobre avances en $).

## Enfoques considerados (se eligió B)

**A — Registrarlo como "venta especial"** (reusar el cobro).
- A favor: reusa cobro y cola offline.
- En contra: una venta **mete** plata; el avance **saca** efectivo. Forzar el modelo de venta a
  dar efectivo descuadra el cuadre fácilmente.

**B — "Operación de caja" propia** ✅ **ELEGIDO**
Flujo nuevo y pequeño que modela el movimiento real (entra digital / sale efectivo), aplica la
comisión y ajusta el cuadre.
- A favor: el cuadre cuadra; la comisión queda registrada; encaja con Contabilidad.
- En contra: flujo nuevo + hay que tocar el cálculo del cuadre.

**Por qué B:** un avance saca efectivo de la gaveta; el cuadre tiene que saberlo o el arqueo
siempre dará faltante.

## El "cómo" ya decidido

### Modelo de datos (migración **V9__operaciones_caja.sql**, con RLS)

- **`operaciones_caja`** — una fila por operación, atada al turno:
  `id, negocio_id, turno_id, caja_id, tipo ('AVANCE'|'RECARGA'),
  forma ('METODO_NEGOCIO'|'PAGO_MOVIL_CUENTA') [solo avance],
  monto_base NUMERIC(12,2), metodo_entrada (enum de pago), cuenta_destino TEXT NULL [forma 2],
  efectivo_entregado NUMERIC(12,2) NULL [avance], moneda_efectivo ('BS'|'USD'),
  comision_pct NUMERIC(5,2), comision_monto NUMERIC(12,2),
  servicio TEXT NULL [recarga: telefonía/internet/…], referencia TEXT NULL [línea/teléfono],
  created_by, created_at`.
- **`operaciones_config`** (o columnas en `negocios`) — comisión por defecto por negocio:
  `negocio_id, comision_avance_pct, comision_recarga_pct`.

### Integración con el cuadre (CuadreService)

- El `resumen` y el `cerrarSimple` del turno pasan a considerar las operaciones del turno:
  - **Efectivo entregado en avances** → se **resta** del efectivo esperado en gaveta.
  - **Digital recibido** (avance/recarga pagada en digital) → suma a los métodos digitales.
  - La **comisión** se contabiliza como ingreso (no infla las ventas).
- Nuevo esperado en gaveta ≈ `fondo + efectivo cobrado en ventas − vuelto − efectivo entregado
  en avances (+ efectivo recibido en recargas pagadas en efectivo)`.

### API (sesión de caja, turno abierto)

- `POST /api/operaciones` — `{tipo, forma?, montoBase, metodoEntrada, cuentaDestino?,
  efectivoEntregado?, monedaEfectivo, comisionPct, servicio?, referencia?}`. El servidor calcula
  `comisionMonto` y registra; valida turno y permiso de cobro.
- `GET  /api/operaciones?turnoId=` — lista del turno (para el cierre y el detalle).
- `GET/PUT /api/operaciones/config` — comisión por defecto (dueño/encargado).

### Frontend

- En la pantalla de **Caja** (cajero): un acceso **"Avance / Recarga"** con un formulario corto
  (tipo, forma, monto, método, comisión prellenada y editable; muestra cuánto entrega y cuánto
  gana). Soporta la cola offline como las ventas.
- En el **cuadre**: las operaciones del turno aparecen en el resumen (efectivo entregado,
  digital recibido, comisión ganada).

## Qué queda a criterio del constructor (builder)

- Número de migración (se asume **V9**), nombres exactos, RLS calcada de V5/V6.
- Enums exactos y validaciones (monto > 0, comisión 0–100, etc.).
- Que las operaciones exijan **permiso de cobro** como las ventas (propuesto: sí).
- Pruebas: aislamiento + **cuadre correcto con un avance** (el efectivo esperado baja) + comisión
  bien calculada, al estilo de las pruebas existentes.

## A confirmar con el dueño (preguntas abiertas)

1. **Recarga:** ¿la app **solo la registra** (el cajero la hace por su medio de siempre) — lo que
   propongo para v1 — o esperas que la app **conecte con la operadora** y recargue de verdad?
2. **Moneda del avance:** ¿el efectivo que entregas es **siempre en Bs**, o también das avances en
   **$**?
3. **Comisión:** ¿un % configurable **distinto para avance y para recarga** (lo propuesto), y el
   cajero lo puede cambiar en cada operación?
