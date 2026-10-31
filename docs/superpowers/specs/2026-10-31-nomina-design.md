# Diseño — Módulo de Nómina (panel del dueño)

Fecha: 2026-10-31 · Dueño del producto: uriel
Proyecto: KioskPOS Web · Prioridad: P2 (encaja con "crédito a empleados" de CLAUDE.md §6)

## Intención y el porqué

El panel del dueño hoy es delgado (Reportes de hoy, Productos, Equipo/cajas). El dueño
necesita **llevar las cuentas de los sueldos de su equipo dentro de la app**: cuánto le
toca a cada quien, cuánto le ha pagado y cuánto le debe, sin cuadernos aparte. Además, en
la bodega es normal que un empleado **se lleve algo del negocio**; eso tiene que **bajar
del inventario** y **descontarse de lo que se le debe**.

Nace de una conversación de brainstorming (2026-10-31): el dueño pidió "módulos para hacer
cuentas de lo ganado para pagos de nómina" y aclaró que es **sueldo fijo acordado**, no pago
por ventas; y que el consumo del empleado se descuenta **al precio de venta al público**.

## Objetivos (goals)

- Configurar, por empleado, un **sueldo fijo** (monto en $) y un **período** (semanal o
  quincenal).
- Mostrar por empleado: **cuánto le toca** en el período, **cuánto se le ha pagado** y
  **cuánto se le debe** (saldo).
- Registrar **pagos/abonos** al empleado a lo largo del tiempo.
- Registrar **consumos (vales)**: el empleado se lleva un producto → baja el stock y se
  carga a su saldo **al precio de venta** (`precio_usd`).
- Pantalla nueva **"Nómina"** en el panel del dueño, con soporte claro/oscuro.

## No-objetivos (non-goals)

- No calcula sueldos por comisión, por ventas ni por horas (sueldo fijo, no variable).
- No calcula la **ganancia del negocio** — eso va en **otro módulo aparte** (decisión del
  dueño en la misma conversación).
- No es contabilidad formal, ni impuestos, ni recibos de pago fiscales.
- No toca cajeros como usuarios de este módulo (lo usa el dueño; ver "A confirmar").

## Anti-objetivos (que harían esto un fracaso aunque "funcione")

- Que el **consumo del empleado cuente como venta/ingreso** o infle la ganancia. (Es la razón
  de elegir la opción B.)
- Que un negocio pueda ver empleados/sueldos/consumos de **otro negocio** (romper RLS).
- Que un consumo **baje el stock sin descontar del sueldo**, o **descuente del sueldo sin
  bajar el stock**: las dos cosas van juntas o no van.

## Restricciones

- **Multi-tenant con RLS:** toda tabla nueva lleva `negocio_id`, tomado SIEMPRE de la sesión
  (nunca del request), con policy RLS `FORCE` como las tablas existentes (ver V5/V6).
- **Moneda:** el catálogo se valora en **$** (`producto.precio_usd`); Bs se deriva por la
  tasa BCV del día. Por eso **los sueldos y saldos se llevan en $**; la UI puede mostrar el
  equivalente en Bs.
- **Reusar inventario:** el consumo baja stock con `InventarioService.ajustarStock(id,
  SALIDA, cantidad, motivo, usuarioId)` — atómico y con bitácora en `movimientos_inventario`.
  No se duplica la lógica de baja de stock.
- Idioma **es-VE** en toda la UI y textos.

## Enfoques considerados (se eligió B)

**A — El consumo se registra como "venta especial"** (tipo de pago "Consumo de empleado").
Reusa todo el flujo de venta (baja stock seguro, valora a precio de venta, podría imprimir
comprobante).
- A favor: reusa código ya probado; idéntico a cobrar.
- En contra: hay que **excluirlo siempre** de reportes de ventas/ganancia, o infla las ventas
  del día con algo que no es plata que entró. Riesgoso y fácil de olvidar.

**B — "Vale de empleado" (registro propio)** ✅ **ELEGIDO**
Flujo propio: empleado + producto + cantidad → baja stock (reusando el descuento atómico del
inventario), valora a precio de venta y lo carga al **saldo del empleado**. Nunca cuenta como
venta.
- A favor: no ensucia ventas ni ganancia; el consumo vive junto a la nómina (donde el dueño
  lo mira); más fácil de entender.
- En contra: es un flujo nuevo (poco código), apoyado en piezas existentes.

**Por qué B:** el dueño separó explícitamente la ganancia en otro módulo; registrar el consumo
como venta obligaría a restarlo en todos lados para no distorsionar esas cuentas. B lo mantiene
fuera de las ventas por construcción.

## El "cómo" ya decidido

### Modelo de datos (migración **V7__nomina.sql**, con RLS)

- **`nomina_config`** — configuración salarial por empleado:
  `id, negocio_id, usuario_id (FK usuarios), sueldo_usd NUMERIC(12,2), periodo
  ('SEMANAL'|'QUINCENAL'), activo bool, created_at`. Un empleado = una config. RLS por
  `negocio_id`.
- **`nomina_movimientos`** — libro (ledger) por empleado:
  `id, negocio_id, usuario_id (empleado), tipo ('PAGO'|'CONSUMO'|'AJUSTE'), monto_usd
  NUMERIC(12,2), fecha, nota, producto_id NULL, cantidad NULL, registrado_por (usuario),
  created_at`. RLS por `negocio_id`.
  - `PAGO`: abono que el dueño le da al empleado (baja el saldo que se le debe).
  - `CONSUMO`: producto que se llevó, valorado a `precio_usd × cantidad` (baja el saldo).
  - `AJUSTE`: corrección manual (+/−), con nota.

### Cálculo del saldo (v1, simple y por período)

- Cada período el empleado **devenga su sueldo completo**.
- `Se le debe ahora = sueldo_del_período − Σ pagos_del_período − Σ consumos_del_período`
  (± ajustes), sobre el período en curso.
- Al cerrar un período, el saldo que sobra o falta **se arrastra** al siguiente (no se pierde).
- (El prorrateo por días transcurridos dentro del período es una mejora opcional; v1 muestra
  el sueldo del período completo. Ver "Decisiones del constructor".)

### API (solo dueño/encargado — ver "A confirmar")

- `GET  /api/nomina/empleados` — lista: nombre, sueldo, período, pagado y **saldo** calculado.
- `PUT  /api/nomina/empleados/{usuarioId}` — fija/edita sueldo + período.
- `POST /api/nomina/empleados/{usuarioId}/pago` — `{montoUsd, nota}` registra abono.
- `POST /api/nomina/empleados/{usuarioId}/consumo` — `{productoId, cantidad}`:
  1) `ajustarStock(productoId, SALIDA, cantidad, "Consumo empleado <nombre>", empleadoId)`;
  2) inserta `nomina_movimientos` tipo CONSUMO por `precio_usd × cantidad`.
  (Ambas en la misma transacción; si una falla, no pasa ninguna.)
- `GET  /api/nomina/empleados/{usuarioId}` — detalle + historial de movimientos.

### Frontend (panel del dueño)

- Nueva pestaña **"Nómina"** en el riel/menú del dueño (`Shell.tsx`), junto a Reportes,
  Productos y Equipo.
- Lista de empleados: nombre, sueldo del período, pagado, **saldo** (con color si está en
  contra). Detalle por empleado con su historial.
- Acciones: **"Registrar pago"** (monto + nota) y **"Registrar consumo"** (buscar producto +
  cantidad; muestra a cuánto se le carga al precio de venta).
- Tema claro/oscuro con tokens (como el resto de la app; nada de colores fijos).

## Qué queda a criterio del constructor (builder)

- Nombres exactos de tablas/columnas, repos/servicios y el wiring siguiendo los patrones
  existentes (entidad + repo + service + controller; policy RLS calcada de V5/V6; prueba de
  aislamiento al estilo `NegocioRlsIsolationTest`).
- Número de migración (se asume **V7**; ajustar si entra otra antes).
- Prorrateo vs sueldo completo al inicio del período (decisión menor; v1 = sueldo completo).
- Validación del consumo cuando no hay stock suficiente (reusa el UPDATE condicional de
  inventario; si no alcanza, error claro).
- Pruebas: aislamiento multi-tenant + flujo (fijar sueldo, registrar pago, registrar consumo
  que baja stock y saldo a la vez), al estilo de las ~20 pruebas existentes.

## A confirmar con el dueño (preguntas abiertas)

1. ¿El **encargado** también puede ver y usar la nómina, o **solo el dueño**?
2. El saldo que sobra o falta al terminar un período, ¿**se arrastra** al siguiente (lo
   propuesto) o cada período arranca en cero?
3. Si el consumo de un empleado **supera su sueldo** (saldo en contra), ¿solo lo mostramos en
   rojo (propuesto) o quieres que avise/bloquee de alguna forma?
