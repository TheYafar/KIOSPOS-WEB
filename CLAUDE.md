# KioskPOS Web — Contexto del proyecto (independiente)

> **Cómo usar este archivo:** Claude Code lo lee solo al iniciar cada sesión en este repositorio.
> Este es un **proyecto independiente**, con su propio repositorio git. No forma parte del KioskPOS
> original ni lo modifica.
>
> **Documento de arquitectura completo (vivo, para humanos):**
> https://claude.ai/code/artifact/d7b9db5b-c05e-4d11-8054-f0bf80a72ff8
>
> **Material de referencia (NO es dependencia):** el KioskPOS de **escritorio** original (Java 21 +
> Spring Boot 3.2.5 + JavaFX 21, SQLite/PostgreSQL), en producción en Bodegas Cocoa, vive en un
> repositorio **aparte**: https://github.com/TheYafar/sistema-de-facturacio-inventario. Se usa solo para
> **portar lógica de dominio** (ventas, cierres, inventario); aquí nunca se modifica ese código. Dueño del
> producto: **uriel** (creador y super admin).
>
> **Referencia de UI (spec pixel-a-pixel):** [`design/mockup.html`](design/mockup.html) — prototipo
> clickeable (HTML/CSS/JS vanilla, con datos de mentira) de prácticamente toda la UI de P1 y P2: login con
> PIN, Caja (catálogo + ticket + flujo de cobro), Super Admin, Inventario, Ventas del día, Cierre de caja,
> Clientes/fiado, Recargas, Devoluciones y Compras. Úsalo como spec cuando se construya el frontend React
> (Paso 5 en adelante) — tokens de diseño, componentes y estados ya están resueltos ahí.

---

## 1. Qué estamos construyendo

KioskPOS Web: la versión web de KioskPOS, un punto de venta para **bodegas en Venezuela**, vendido como
**alquiler mensual (SaaS)**, ~$25/mes por bodega con 1 caja. Hoy existe una versión de escritorio en
producción en **Bodegas Cocoa**; la versión web la reemplaza progresivamente. El primer cliente/piloto es
Bodegas Cocoa.

## 2. Decisiones de arquitectura (ya tomadas — no re-discutir sin avisar)

- **Un solo servidor y una sola base de datos, en la nube, propiedad de uriel (super admin).** Multi-tenant:
  todas las bodegas comparten la base; cada una es un "negocio". Las bodegas **no tienen servidor propio**,
  solo cajas (navegador) que se conectan al central.
- **Separación por cliente con DOS barreras:** (1) columna `negocio_id` en cada tabla, tomada **siempre de la
  sesión**, nunca del request; (2) PostgreSQL **Row Level Security (RLS)** por `negocio_id`.
- **Necesita internet, con tolerancia a cortes cortos** (grace window de unas horas, configurable). La caja
  guarda en el equipo (IndexedDB) una copia + una cola de envíos; sincroniza apenas vuelve la conexión. No es
  offline-first de días.
- **El servidor manda:** la caja calcula para cobrar rápido, pero el servidor **re-valida** cada venta con las
  reglas (servicios Java).
- **Solo ticket, NO factura fiscal** en la primera versión (el SENIAT eliminó la homologación en ago-2026;
  reglas nuevas pendientes). La factura fiscal queda como módulo aparte (P3).
- **Backend:** Java 21 + Spring Boot (versión con soporte vigente). La lógica de dominio del original se
  **porta** (se copia y adapta), no se referencia como dependencia.
- **Frontend:** React + TypeScript, como **PWA instalable** (service worker + IndexedDB para la cola offline).
- **Android (después):** Capacitor envolviendo la misma PWA (Bluetooth/USB para impresora).
- **Impresión en Windows:** un **Conector KioskPOS** (programa Java pequeño local, junto al navegador) que
  imprime el ticket (40 columnas, texto plano) y abre la gaveta. El navegador no imprime directo a la térmica.
- **Migraciones de BD:** Flyway.

## 3. El modelo de negocio EN CÓDIGO (construir temprano — es el corazón)

### Permiso / licencia (kill switch)
- La caja necesita un **permiso firmado por el servidor** para cobrar. Es un *lease* corto (ej. igual al grace
  window).
- Con internet, la caja **renueva el permiso** cada pocos minutos. En cada renovación el servidor verifica si
  el negocio está al día (suscripción activa):
  - Al día → renueva con nueva expiración.
  - Vencido/suspendido → el servidor **niega** la renovación.
- Al expirar el permiso actual, la caja pasa a modo **solo consulta** (no cobra) hasta reconectar y estar al
  día.
- **Seguridad:** permiso firmado por el servidor (no falsificable), expiración validada contra el **reloj del
  servidor**, lease corto. Cambiar la hora del PC o quedarse offline **no** evade el corte.

### Panel de super admin (de uriel)
- Tabla de todos los negocios: nombre/local, **estado** (Activa / Aviso / Suspendida), **pagó hasta** (fecha),
  **meses pendientes**, último pago (monto/fecha/referencia), última vez en línea, # cajas.
- Acciones: **aprobar pago** (empuja "pagó hasta"), **suspender**, **reactivar**, ver cajas de cada negocio.
- Pagos (al inicio **manuales**): el dueño registra la referencia, uriel la aprueba. Automatizar después (P3).
- Escalera de corte: día 1–5 aviso; 6–15 aviso al abrir caja; desde el 16 solo consulta; datos guardados 90
  días más.

## 4. Jerarquía de datos y usuarios

**Negocio** (plan, suscripción, pagos) → **Local** → **Cajas** (equipos registrados) → **Usuarios**.

- **Cajero:** PIN rápido, solo en una caja registrada.
- **Dueño / encargado:** correo + contraseña, desde cualquier lado.
- **Soporte Técnico (uriel):** usuario **visible** en la lista del cliente, que el dueño puede desactivar.
- **Super admin (uriel):** panel aparte, con verificación en dos pasos.

## 5. Qué portar del KioskPOS de escritorio (material de referencia)

El desktop original tiene ~53k líneas Java + ~5k FXML. Un tercio es lógica reusable; dos tercios son pantallas.

- **PORTAR (lógica de dominio, ~20k líneas):** la lógica de — `VentaService`, `CajaService`,
  `CierreCajaService`, `InventarioService`, `ReporteService`, `DevolucionService`, `FacturaCompraService`,
  `CreditoEmpleadoService`, `LibretaDigitalService`, `ClienteService`, `ConfiguracionService`,
  `CobroCalculadoraService`; sus repositorios; los DTOs; las utilidades. **Añadirles `negocio_id`.** Se copia
  y adapta a este proyecto; el original no se toca. La impresión (`ImpresionService`) pasa al Conector.
- **MODELO de sincronización:** `SincronizadorModoLocal` del original (sube ventas sin duplicar; dedup por
  código único; números de factura por caja) es el **modelo** para la cola offline web.
- **REHACER desde cero:** todas las pantallas (JavaFX/FXML) → React. Al portar la lógica, **sacar las reglas
  que en el original viven dentro de las pantallas** (ej. el cálculo del cierre simple vive en
  `CashRegisterController`) y ponerlas en servicios, para que las usen el servidor y las pruebas.
- **Pruebas:** portar las ~48 pruebas de harness del original (cierre simple, apertura sin doble suma, borrar
  producto para siempre, etc.) como pruebas de este servidor.

## 6. Prioridad de módulos

### P1 — Primero (MVP: vender + cobrar la mensualidad)
Servidor central multi-cliente · Login / usuarios / registro de caja · **Permiso y corte por falta de pago** ·
**Panel de super admin** · Ventas (efectivo Bs/$, punto, pago móvil, Biopago, cobro rápido, lector, ticket) ·
Inventario (productos, precios, existencias, importar CSV) · Cuadre de caja (apertura + cierre simple) · Cobro
sin internet + sincronización · Conector de impresión (Windows) · Reportes del día (ventas y ganancia) · Panel
del dueño básico.

### P2 — Después (casi todo porta lógica ya existente)
Fiado / libreta de clientes · Recargas y avances · Devoluciones · Historial y reportes avanzados · Facturas de
compra · Crédito a empleados · Multicaja / supervisión · Habladores de precio / valor de inventario.

### P3 — Más adelante
App Android completa · Factura fiscal (SENIAT) · Pago automático de la mensualidad · Sucursales / traslados ·
Dashboards avanzados del dueño.

> **Pendiente de confirmar con uriel:** Bodegas Cocoa usa **fiado, recargas y avances** a diario. Puede que
> haya que subirlos al tope de la P2 para tenerlos listos antes de que Cocoa migre del todo.

## 7. Orden de construcción

1. **Scaffold backend:** Spring Boot + PostgreSQL 16 + Flyway; `docker-compose` para dev.  ✅ hecho
2. **Multi-tenant:** entidad `Negocio`; `negocio_id`; filtro de sesión + RLS; **prueba** "leer datos de otro
   negocio debe fallar".  ✅ hecho
3. **Auth:** usuarios, roles, login (correo/contraseña), PIN de cajero, registro/autorización de caja.
4. **Permiso/licencia (lease)** + suscripción del negocio + **panel de super admin** (CRUD de negocios,
   aprobar pago, suspender/reactivar).
5. **Ventas API** (portar `VentaService`, con `negocio_id`) + pantalla de cobro React + ticket 40 columnas.
6. **Inventario API** + import CSV + pantalla.
7. **Cuadre:** apertura + cierre simple.
8. **Offline:** PWA + IndexedDB + cola de envíos + **sincronización idempotente**.
9. **Conector de impresión** (Windows).
10. **Reportes del día** + panel del dueño básico.

## 8. Hosting / operación 24-7

- **Vultr, región Miami** (cerca de Venezuela). Pago con **cripto** (USDT/USDC vía BitPay) — se paga desde
  Venezuela sin tarjeta internacional.
- **Base de datos administrada de Vultr** (desde $15/mes: respaldo automático, failover, 99,99% SLA). Empezar
  con servidor 2 GB (~$12) + BD administrada; subir a 4 GB con clientes.
- **24-7 =** nube (no en casa) + app con **auto-restart** + **respaldo diario** off-site + **monitoreo**
  (UptimeRobot gratis).
- La cuenta de Vultr y las claves **son la llave del negocio**: definir a nombre de quién van y dónde se
  guardan.

## 9. Restricciones duras (no violar)

- **NO** crear cuentas admin ocultas / backdoor imposibles de borrar. La cuenta **visible** "Soporte Técnico"
  sí está permitida.
- **NO** procesar ventas/transacciones reales en el POS en vivo del cliente al hacer demos o pruebas.
- El **vuelto** siempre sale de la caja y se descuenta en el cuadre.
- **Ticket** térmico de 40 columnas, texto plano.
- No rodear hosts bloqueados por política (403, ej. Maven Central); reportar, no evadir.

## 10. Idioma

El producto y la UI en **español (Venezuela)**. Montos en Bs y $, a la **tasa BCV del día**.

## 11. Estado de avance (actualizar en cada sesión)

- **Paso 1 — Scaffold backend:** hecho. `backend` (Maven, Spring Boot 3.5.x, Java 21),
  `docker-compose.yml` (Postgres 16 dev), Flyway configurado.
- **Paso 2 — Multi-tenant:** hecho. `negocio_id` + Row Level Security real en Postgres (doble barrera:
  `NegocioContext` en la app + `SET LOCAL app.current_negocio_id` + policy RLS con `FORCE ROW LEVEL
  SECURITY`, fail-closed si no hay contexto). Prueba de aislamiento con Testcontainers en
  `backend/src/test/java/.../NegocioRlsIsolationTest.java`. **Pruebas en verde** contra Postgres 16 real.
  Detalle aprendido: las policies usan `NULLIF(current_setting('app.current_negocio_id', true), '')::bigint`
  porque tras un `SET LOCAL` previo en la conexión del pool el GUC vuelve a `''` (no NULL); sin el NULLIF, el
  fail-closed no cerraba y el cast a bigint reventaba.
- **Paso 3 — Auth:** hecho. **Pruebas en verde.**
  - Spring Security sin estado + **JWT firmado por el servidor** (HS256, `JwtService`/`JwtAuthFilter`). El
    filtro fija el `negocio_id` en `NegocioContext` desde el token, que es lo que activa RLS por petición.
  - **Contraseñas y PIN con BCrypt** (el escritorio los tenía en texto plano — NO se portó eso).
  - Dos caminos de entrada: **dueño/encargado** (correo+contraseña, `POST /api/auth/login-dueno`) y
    **cajero** (PIN sobre caja registrada, `POST /api/auth/login-cajero`).
  - Tablas de datos (`usuarios`, `cajas`, `locales`) bajo RLS; tablas de **directorio** sin RLS
    (`cuentas_login`, `caja_tokens`) para resolver el negocio ANTES de que exista sesión (el único acceso
    pre-contexto, por clave exacta).
  - Registro/autorización de caja: `POST /api/cajas` (solo dueño/encargado) devuelve el token de la caja UNA
    vez; `GET /api/caja/cajeros` (con header `X-Caja-Token`) para la pantalla de bloqueo.
  - Alta de negocio+dueño: `NegocioRegistroService` (lo usará el panel de super admin del Paso 4; por ahora
    seed/pruebas).
  - Pruebas en `src/test/java/.../auth/AuthFlowIsolationTest.java` (login dueño, PIN cajero, cruce de negocio
    bloqueado, listado aislado).
  - **Pendiente/consciente:** falta refresh tokens, 2FA del super admin, bloqueo por intentos fallidos y el
    endpoint real de alta de negocio (va en el Paso 4). El JWT lleva el `rol` grabado: al cambiar el rol de un
    usuario, su token viejo sigue valiendo hasta expirar (TTL 12h por defecto) — aceptable por ahora.
- **Paso 4 — Permiso/licencia + suscripción + super admin:** hecho. **Pruebas en verde.**
  - **Suscripción:** `negocios` gana `plan` + `pago_hasta`; `estado` se reusa como override manual
    (SUSPENDIDA/ACTIVA). `SuscripcionService` calcula la situación contra el reloj del servidor y la escalera
    de corte: al día → ACTIVA cobra; 1..15 días vencido → AVISO aún cobra; >15 → SUSPENDIDA efectiva, solo
    consulta. `dias-gracia` configurable (`kioskpos.suscripcion.dias-gracia`, default 15).
  - **Permiso (kill switch):** `PermisoService` + `POST /api/permiso/renovar`. La caja (JWT con cajaId) pide
    un permiso corto firmado (JWT `tipo=permiso`, TTL `kioskpos.permiso.lease-minutes`, default 10) que solo
    se emite si el negocio puede cobrar. `exigirPermisoVigente(...)` lo usará la API de ventas (Paso 5).
  - **Pagos manuales:** tabla `pagos` (sin RLS, facturación transversal). El dueño reporta
    (`POST /api/mi-negocio/pagos`, queda PENDIENTE) y el super admin aprueba (empuja `pago_hasta`).
  - **Super admin (global):** tabla `super_admins` (sin RLS). Login `POST /api/admin/login` → JWT sin negocio
    (rol SUPER_ADMIN; el filtro no fija NegocioContext). Panel: `GET /api/admin/negocios` (con situación
    calculada, # cajas, última vez en línea, último pago), `POST /api/admin/negocios` (alta negocio+dueño),
    `GET .../cajas`, `POST .../suspender`, `POST .../reactivar`, `GET /api/admin/pagos-pendientes`,
    `POST /api/admin/pagos/{id}/aprobar`. Para leer datos bajo RLS de un negocio (sus cajas), el admin fija el
    contexto de ese negocio explícitamente.
  - **Primer super admin:** `SuperAdminSeeder` lo crea al arrancar SOLO si se dan
    `KIOSKPOS_BOOTSTRAP_SUPERADMIN_EMAIL`/`_PASSWORD` por entorno y no existe ninguno (sin default → sin
    backdoor, CLAUDE.md §9).
  - Pruebas en `src/test/java/.../suscripcion/SuscripcionPermisoTest.java` (escalera de corte, permiso solo
    al día, aprobar pago reactiva).
  - **Pendiente/consciente:** 2FA del super admin, pago automático (P3), y la lista de negocios cuenta cajas
    con un switch de contexto por negocio (N+1; bien para pocos negocios, revisar si crece).
- **Paso 5 — Ventas API + ticket 40 columnas:** hecho (backend). **Pruebas en verde (12/12).**
  - `POST /api/ventas` (sesión de caja): el servidor re-valida (CLAUDE.md §2) — recalcula el total con SUS
    precios (ignora el precio del request), baja stock de forma ATÓMICA (`descontarStock`, UPDATE condicional),
    valida que los pagos cubran el total y calcula el vuelto (`CobroCalculadora`, portado).
  - **Kill switch:** cobrar exige el permiso de cobro vigente en el header `X-Permiso`; sin él → 403.
  - **Factura por caja:** `numero_factura` correlativo por caja. **Idempotencia:** `codigo_unico` (UUID del
    cliente) dedup reenvíos de la cola offline — no cobra dos veces (modelo para el Paso 8).
  - **Cobro rápido:** línea sin producto de catálogo (producto_id null), cobrada por monto con su nombre.
  - **Ticket 40 columnas, texto plano** (`TicketService`, `GET /api/ventas/{id}/ticket`) para el Conector.
  - **Pendiente/consciente:** sin turno/cuadre todavía (Paso 7, la venta aún no se ata a un turno), sin
    descuento ni redondeo Bs, sin fiado/avances/recargas (P2). La pantalla de cobro React va con el frontend.
- **Paso 6 — Inventario API + import CSV:** hecho (backend). **Pruebas en verde (16/16).**
  - `productos` ampliado (costo, categoría, stock mínimo, pesable, unidad). `movimientos_inventario` (RLS) con
    bitácora de cada cambio de stock.
  - `InventarioService`: CRUD, `ajustarStock` (ENTRADA/SALIDA/FIJAR con movimiento), `importarCsv` (upsert por
    código de barras), `eliminar` "para siempre" (desenlaza las líneas de venta —que guardan nombre y monto—
    y borra; los movimientos caen por cascada).
  - Endpoints `/api/inventario/productos` (GET con `?q=`, POST, PUT, DELETE), `.../{id}/ajuste`,
    `POST /api/inventario/importar` (CSV en el cuerpo). Leer: cualquier usuario; escribir: dueño/encargado.
  - **Pendiente/consciente:** sin códigos alternos, empaques/desempaque ni categorías como entidad (P2);
    pantalla React con el frontend.
- **Paso 7 — Cuadre (apertura + cierre simple):** hecho (backend). **Pruebas en verde (18/18).**
  - `turnos` (RLS): sesión de caja con fondo inicial; índice único parcial → un solo turno ABIERTO por caja.
    `ventas` gana `turno_id` (la venta se ata al turno abierto de su caja al cobrar).
  - `CuadreService` (lógica sacada del controller, como pide CLAUDE.md §5): `abrir(fondo)`, `resumen` (vivo) y
    `cerrarSimple(contado)`. Esperado en gaveta = fondo + efectivo cobrado − vuelto. El vuelto sale de la caja
    (§9) y la base NO se suma dos veces (lo contado ES la gaveta completa). Diferencia = contado − esperado
    (sobrante/faltante).
  - Endpoints `POST /api/cuadre/abrir`, `GET /api/cuadre/turnos/{id}`, `POST /api/cuadre/turnos/{id}/cerrar`.
  - **Pendiente/consciente:** sin gastos/avances/devoluciones en el cuadre (P2), sin ticket Z todavía, sin
    cierre "ciego" ni desglose multicaja. Solo efectivo USD/Bs y vuelto (punto/pago móvil/biopago son digitales
    y no afectan la gaveta de efectivo).
- **Paso 8 — Offline (PWA + cola idempotente):** hecho (base del frontend). **Compila y construye** (`npm run
  build` OK: service worker + manifest generados).
  - Primer código del **frontend**: `frontend/` (Vite + React + TS), PWA instalable con `vite-plugin-pwa`
    (autoUpdate, precache del shell). En dev, `/api` hace proxy al backend (puerto 8080).
  - **Cola de envíos** en IndexedDB (`src/outbox.ts`, vía `idb`): cobrar SIEMPRE encola primero (durable) y
    luego intenta enviar. La clave es el `codigoUnico` de la venta.
  - **Sincronización idempotente** (`src/api.ts`): al reconectar (evento `online`) se vacía la cola contra
    `POST /api/ventas` con `codigoUnico`; el servidor deduplica, así que reenviar algo ya cobrado se trata como
    éxito y se saca de la cola (no cobra dos veces — modelo SincronizadorModoLocal). Error de red → se queda en
    cola; error de negocio → se marca y no reintenta en bucle; 401/403 → espera permiso/sesión.
  - `src/App.tsx` es una pantalla de DEMO del mecanismo (no la UI final; esa sale del mockup).
  - **Pendiente/consciente:** faltan iconos reales (`public/icon-192.png`, `icon-512.png`); la UI de verdad
    (login PIN, catálogo, ticket) es el siguiente gran bloque de frontend; aún no hay pruebas automáticas del
    front.
- **Paso 9 — Conector de impresión (Windows):** hecho. **Compila (javac + frontend).**
  - `conector/`: programa Java pequeño (Java 21, SIN dependencias — solo JDK) que corre junto al navegador.
    Servidor HTTP **solo en 127.0.0.1:9010** con CORS; `GET /estado`, `POST /imprimir` (cuerpo=ticket,
    headers `X-Abrir-Gaveta`/`X-Impresora`), `POST /abrir-gaveta`.
  - `Impresora.java`: ESC/POS crudo al spooler de Windows (`javax.print`) + corte de papel + abrir gaveta
    (`ESC p 0 25 250`), portado de ImpresionService del escritorio.
  - Cliente en el frontend: `frontend/src/conector.ts` (la PWA pide el ticket a `GET /api/ventas/{id}/ticket`
    y se lo pasa al Conector).
  - **Pendiente/consciente:** empaquetar como servicio de Windows con auto-arranque + icono de bandeja;
    calibración de impresora desde la PWA.
- **Paso 10 — Reportes del día + panel del dueño básico:** hecho (backend). **Pruebas en verde (20/20).**
  - `ReporteService.resumenDelDia(fecha)` (bajo RLS, suma todo el negocio y todas sus cajas): total vendido
    ($ y Bs), cantidad de ventas, costo, **ganancia** (total − costo) y **desglose por método de pago**.
    Rango del día en zona America/Caracas.
  - Costo/ganancia usan el costo ACTUAL del producto (join por producto_id); las líneas sin producto (cobro
    rápido / producto borrado) no suman costo. Para ganancia histórica exacta habría que guardar el costo en
    la línea de venta (mejora futura).
  - Endpoint `GET /api/reportes/dia?fecha=YYYY-MM-DD` (autenticado; el dueño lo verá en su panel).
  - **Pendiente/consciente:** productos más vendidos y gráficos, y el panel del dueño como pantalla React (va
    con el frontend completo).

---

## 12. P1 (MVP) — estado general

El **backend de P1 está completo y probado** (20/20 contra Postgres real): multi-tenant con RLS, auth
(dueño/cajero/super admin), licencia/suscripción + kill switch, ventas, inventario, cuadre y reportes. Hay
además la base del **frontend** (PWA con cola offline) y el **Conector** de impresión. 

**Frontend (React PWA, en `frontend/`) — P1 completo:** Login (PIN cajero / correo dueño / admin), Caja +
cobro con 6 métodos incl. **mixto**, Cuadre (apertura/cierre), Inventario (CRUD + ajuste + CSV), Reportes del
dueño, panel de **Super admin** (negocios, aprobar pago, suspender/reactivar, alta de negocio) y Usuarios/Cajas.
**Responsive**: riel lateral en escritorio/tablet, pestañas en móvil. Todo probado contra el backend real.

**Despliegue (listo):** Dockerfiles de backend y frontend + `docker-compose.prod.yml` + `.env.example` +
`DESPLIEGUE.md` (incluye pasos para Vultr). Un `docker compose -f docker-compose.prod.yml up -d --build`
levanta Postgres + backend + PWA.

**Lo que falta (P2, necesita backend nuevo primero):** fiado/libreta de clientes, recargas y avances,
devoluciones, facturas de compra, crédito a empleados, multicaja/supervisión, habladores de precio. Cocoa usa
fiado/recargas/avances a diario (ver nota §6), así que es lo próximo tras probar el P1 desplegado. También:
empaquetar el Conector como servicio de Windows, y HTTPS en el despliegue (la PWA lo requiere para instalarse).

## 13. Módulo Contabilidad (panel del dueño) — primera versión

Pantalla pensada para un dueño SIN conocimientos contables (no para un contador): ver cuánto entró, cuánto le
quedó y comparar. Vive en el riel del dueño como **"Cuentas"** (`frontend/src/screens/Contabilidad.tsx`). Dos
modos:

- **Automática** (datos reales del servidor): ganancia del día, **cierre por cierre** y desglose por método de
  pago. Usa `GET /api/reportes/dia` (ya existía) y el nuevo `GET /api/reportes/cierres?fecha=` — lista los
  turnos CERRADOS del día con vendido/ganancia/cuadre por cierre (`ReporteService.cierresDelDia`, bajo RLS,
  queries derivadas en `TurnoRepository`/`DetalleVentaRepository.costoDeTurno`). Incluye un bloque que
  **compara** el cálculo automático contra lo que el dueño anotó a mano (para detectar descuadres).
- **A mano** (guardado LOCAL por ahora, `frontend/src/contabilidad-local.ts` en localStorage): (1) **Libreta
  guiada** — anota cierres/gastos/entradas y suma; (2) **Hoja libre** tipo Excel — varias hojas con nombre,
  columnas propias (renombrar + marcar $ o Bs con la tasa del día para convertir a $), plantillas, y
  **exportar a CSV** (copia de seguridad que abre en Excel).

**Decisión de diseño:** se quitó el "repartidor de sobres" con % impuesto; cuánto apartar para reponer
mercancía lo decide el dueño a mano (plantilla "Mis cuentas" en la Hoja libre).

**Pendiente/consciente:** lo de "A mano" se guarda en el equipo (per-dispositivo); el siguiente paso es
persistirlo en Postgres con `negocio_id` + RLS (tablas nuevas) y mover el export a `.xlsx` real / endpoint.
Falta también el filtro por semana/mes (hoy solo "hoy"). El backend nuevo es mínimo y sigue los patrones
existentes, pero NO se pudo compilar en el entorno de desarrollo remoto (Maven Central bloqueado por política,
§9): se verifica en CI / entorno con dependencias.

## 14. Profesionalización / onboarding (quick wins, solo frontend)

Mejoras para que la app se vea más profesional y el alta de un negocio sea intuitiva. **Todo frontend, build
verificado (`npm run build` OK).**

- **Login desde cualquier dispositivo** (`Login.tsx`): un equipo nuevo abre con **"Entra a tu negocio"**
  (correo/clave del dueño, funciona desde donde sea) en vez de exigir "Configura esta caja". Esa config queda
  como opción secundaria ("Configurar este equipo como caja"), y solo el equipo-caja registrado abre con los
  cajeros + PIN. **Enlace de configuración**: abrir `.../#caja=TOKEN` precarga el token (el panel del dueño,
  en `Usuarios.tsx`, ahora copia ese enlace, no solo el token). Los cajeros siguen entrando SOLO en la caja
  registrada (seguridad del PIN de 4 dígitos, §4).
- **Guía "Primeros pasos"** (`PrimerosPasos.tsx`, arriba de Reportes): checklist que aparece solo mientras
  falta algo (0 cajas / 0 cajeros / 0 productos) y lleva al dueño paso a paso; se oculta sola al completar.
- **"Mi plan"** (`MiPlan.tsx`, arriba de la pestaña "Más"/Equipo y cajas): el dueño ve su estado
  (ACTIVA/AVISO/SUSPENDIDA), hasta cuándo pagó y su deuda, y **reporta un pago** (que el super admin aprueba).
  Usa endpoints que YA existían: `GET /api/mi-negocio/suscripcion`, `GET/POST /api/mi-negocio/pagos`.
- **Iconos/splash PWA**: `public/icon.svg` (marca KioskPOS) + manifest y `index.html` apuntando a él; faltaban
  los PNG. Splash oscuro de marca.

**Pendiente/consciente (necesitan backend, van con PR):** "Olvidé mi contraseña" (endpoint de reset + correo),
ajustes del negocio (nombre/logo/dirección) y **marca del negocio en el ticket** (hoy el ticket es genérico;
`TicketService` es backend), QR de emparejamiento (hoy solo enlace/copiar), HTTPS en despliegue, y WhatsApp
transaccional.

## 15. Correo transaccional (Resend por SMTP)

`EmailService` (`backend/.../correo/EmailService.java`) envía correos a los dueños. Va por **SMTP** con
`spring-boot-starter-mail`, así que es **agnóstico del proveedor** (Resend elegido; Brevo/SES solo cambian las
variables). **Async (`@EnableAsync`) y a prueba de fallos**: si el correo no está configurado o falla, NO rompe
el alta/venta/login (try/catch + log).

- **Config por entorno** (en `application.yml`, `.env.example`, `docker-compose.prod.yml`): `MAIL_ENABLED`
  (default false → no envía), `MAIL_HOST` (Resend: `smtp.resend.com`), `MAIL_PORT` (587), `MAIL_USER`
  (`resend`), `MAIL_PASS` (= API key de Resend), `MAIL_FROM`, `MAIL_APP_URL`.
- **Enganchado:** correo de **bienvenida** al crear un negocio (`AdminService.crearNegocio`). Ya existe el
  método `pagoAprobado(...)` para cuando el super admin aprueba (falta engancharlo: necesita el correo del
  dueño del negocio, que hay que resolver desde su `cuenta_login`/usuario).
- **Deliverability:** para no caer en spam hay que **verificar el dominio** en Resend (registros DNS SPF/DKIM)
  y usar `no-reply@tudominio.com`; antes de eso, el remitente de prueba es `onboarding@resend.dev`.
- **Consciente:** backend NO compilado aquí (Maven bloqueado, §9); se verifica en CI.

## 16. CI + tasa/configuración controladas por el servidor

- **CI** (`.github/workflows/ci.yml`): en cada push/PR corre backend (`mvn verify`, Postgres real con
  Testcontainers) y frontend (Vitest + build + Playwright e2e con API simulada en `frontend/e2e/mock.ts`).
  Como aquí Maven está bloqueado (§9), **el backend se verifica en CI**.
- **Config de caja del negocio en el servidor** (V10: `negocios.metodos_pago` JSON + `tasa_modo`
  BCV/AJUSTE/MANUAL, `tasa_ajuste_tipo` PCT/BS, `tasa_ajuste`, `tasa_manual`).
  `GET /api/mi-negocio/caja-config` (cualquier usuario, incl. cajero) devuelve también `tasaBcv` y
  `tasaEfectiva`; `PUT` solo dueño/encargado. La PWA guarda copia local (`kp_config`) para cobrar sin internet.
- **La tasa la decide el servidor** (`TasaNegocioService`): una venta EN VIVO debe usar la tasa del negocio
  ±3%; una que llega de la cola sin internet (`creadoAt` > 10 min) se acepta con su tasa (ya se cobró).
- `TasaService` no frena ventas: refresca en segundo plano si ya hay tasa y espera 5 min tras un fallo.
  En pruebas la URL de la BCV apunta a un puerto cerrado (sin red).

## 17. Seguridad del acceso + operación (Sección 3)

- **Bloqueo por intentos** (`seguridad/IntentosLoginService`, tabla directorio `intentos_login`, V11): 5 fallos
  seguidos de PIN (por caja+cajero), clave del dueño (por correo) o super admin → 15 min bloqueado. Mensajes
  "Te quedan N intentos". Configurable `KIOSKPOS_LOGIN_MAX_INTENTOS` / `_BLOQUEO_MINUTOS`.
- **Olvidé mi contraseña** (`RecuperarClaveService`, tabla `reset_clave`): `POST /api/auth/olvide-clave`
  (respuesta genérica, máx. 3/h) manda por correo `…/#reset=TOKEN` (30 min, un uso, se guarda el SHA-256);
  `POST /api/auth/restablecer-clave`. Como Render bloquea SMTP, el super admin genera el enlace (24 h) con
  `POST /api/admin/negocios/{id}/enlace-clave` y lo manda por WhatsApp (botón "Clave" en el panel).
- **2FA del super admin** (TOTP RFC 6238, solo JDK: `seguridad/Totp`): `GET /api/admin/2fa`,
  `POST …/2fa/iniciar|activar|desactivar`; el login responde 401 `{requiere2fa:true}` si falta el código.
  QR generado en el navegador (`qrcode-generator`). Pendiente: cifrar `totp_secreto` en reposo.
- **Rotación JWT:** `KIOSKPOS_JWT_SECRET_ANTERIOR` se acepta (no firma) durante la rotación.
- **Operación:** `ops/vps-inicial.sh` (ufw, fail2ban, parches, swap, Docker, cron), `ops/respaldo.sh`
  (pg_dump diario, 14 días, copia off-site con rclone), `ops/restaurar.sh`, `db/init/02-app-password.sh`
  (clave real de `kioskpos_app`). Guía: **SEGURIDAD.md**.

## 18. Gastos, avances y fiado (Sección 4)

- **Movimientos de caja** (V12 `movimientos_caja`, `cuadre/MovimientoCajaService`): GASTO, RETIRO, INGRESO y
  AVANCE (cliente paga por punto/pago móvil/biopago, se le entrega efectivo; `comision` = ganancia en Bs).
  `POST /api/cuadre/movimientos`, `GET /api/cuadre/turnos/{id}/movimientos`, `POST …/movimientos/{id}/anular`.
  No deja sacar más efectivo del que hay. Cuadre: esperado = fondo + ventas − vuelto − gastos − retiros −
  avances + ingresos + abonos en efectivo; avances/abonos digitales suman a su método.
- **Fiado** (V12 `clientes`, `movimientos_cliente` CARGO/ABONO, `ventas.cliente_id`, método `FIADO` en USD):
  `/api/clientes` (GET ?q, POST, PUT solo dueño/encargado, `/{id}`, `/{id}/abonos`). Límite opcional por cliente;
  el cajero anota clientes pero el límite lo pone el dueño. Saldo = cargos − abonos.
- **PWA:** pestaña **Fiado** (`screens/Clientes.tsx`: lista con quién debe, detalle, abonos, recordatorio por
  WhatsApp), tarjeta **Fiado** al cobrar con selector de cliente (teclado), y **Movimientos de caja** en el
  Cierre (`screens/MovimientosCaja.tsx`, teclas G/R/I/A). "Fiado" se puede apagar en Configuración.
- Reporte del día: movimientos, comisión de avances y abonos recibidos.

## 19. Compras, anular ventas y devoluciones (Sección 5)

- **Compras** (V13 `proveedores`, `compras`, `compra_detalles`; `compra/CompraService`, solo dueño/encargado):
  `/api/proveedores` (GET/POST/PUT), `/api/compras` (GET, POST, `/{id}`, `/{id}/pagada?valor=`, `/{id}/anular`).
  Registrar suma stock ATÓMICO (`ProductoRepository.sumarStock`), recalcula **costo promedio ponderado**
  (`CompraService.costoPromedio`), puede cambiar el precio de venta y queda pagada o "por pagar". Anular saca
  el stock solo si todavía está.
- **Anular venta** (`devolucion/DevolucionService.anular`): solo con su turno ABIERTO y sin devoluciones; el
  cajero solo las de su caja. Vuelve el stock, sale del cuadre/reportes (estado ANULADA) y baja lo fiado.
- **Devolución** parcial/total (V13 `devoluciones`, `devolucion_detalles`): nunca más de lo vendido; reembolso
  `EFECTIVO_USD`/`EFECTIVO_BS` (sale de la gaveta del turno abierto, a la tasa de la venta), `A_CUENTA` (baja el
  fiado) o `FUERA_DE_CAJA` (solo dueño). Cuadre resta las devoluciones en efectivo; reporte del día trae
  `devolucionesUsd`.
- API: `GET /api/ventas?fecha=` (caja: las suyas; dueño: todas), `GET /api/ventas/{id}/detalle`,
  `POST /api/ventas/{id}/anular`, `POST /api/ventas/{id}/devolver`.
- **PWA:** pestaña **Ventas** (`screens/Ventas.tsx`) en caja y dueño; **Compras** dentro de Productos
  (`screens/Compras.tsx`: facturas + proveedores). Barra de pestañas deslizable en móvil y la app con menú
  ocupa exactamente la pantalla (`.app:has(> .shell)`).

## 20. Devoluciones "como pagó" + fiado de trabajadores

- **Devolver** (`RepartoReembolso`, V14 `devolucion_reembolsos`): `COMO_PAGO` reparte lo devuelto entre las
  formas en que pagó el cliente, en proporción y sin contar el vuelto (lo fiado vuelve a su cuenta); o todo por
  `EFECTIVO_USD/EFECTIVO_BS/PAGO_MOVIL/PUNTO/BIOPAGO`. El cuadre resta cada parte de su forma. Mismo cálculo en
  la PWA (`frontend/src/reembolso.ts`). Historial: `GET /api/ventas/buscar?numero=`. En Ventas: "Solo este" por
  producto o "Devolver toda la venta". La barra de abajo del turno muestra lo neto (− vuelto − devuelto).
- **Fiado de trabajadores** (V15 `clientes.tipo` CLIENTE/TRABAJADOR + `sueldo_usd`): lo que se lleva un
  trabajador es una venta fiada (baja stock); sin límite propio no puede deber más que su sueldo; el dueño hace
  `POST /api/clientes/{id}/descuento-sueldo` (abono `NOMINA`, no toca caja). Pestaña Fiado: Clientes | Trabajadores.

## 21. Fiar desde el perfil + productos por peso o medida

- **Perfil del cliente/trabajador** (Fiado → tocar un nombre): pestañas **Cuenta** | **Fiar productos**. En
  "Fiar productos" se buscan productos (o se escanea el código) y se fían ahí mismo:
  `POST /api/clientes/{id}/fiar {tasa, items}` → `VentaService.fiarDesdeLibreta` (precios del servidor, baja
  stock, todo como FIADO, respeta límite/sueldo, exige negocio al día). Sin caja (dueño): venta con
  `caja_id NULL` (V16) y correlativo propio (`maxNumeroFacturaSinCaja`); desde una caja, queda en esa caja.
- **Por peso o medida** (`productos.es_pesable` + `unidad_medida` KG/G/L/M): `screens/Pesable.tsx`
  (`CantidadPesable`, en portal) pide la cantidad, o el monto en $ / Bs, y calcula el precio. Se usa en Vender
  y en Fiar. Inventario → Nuevo producto tiene "Se vende por peso o medida" con la unidad.
- **Categorías** (V17 `categorias`, `inventario/CategoriaService`): `GET/POST/PUT/DELETE /api/inventario/categorias`
  (lista = creadas + las que usan los productos, con conteo; renombrar cambia sus productos; borrar los pasa a
  "General"). Inventario: botón **Categorías**, filtro por categoría, y el formulario de producto (nuevo y
  **Editar datos**) elige la categoría de una lista o crea una nueva, y marca peso/medida con su unidad.

## 22. Cajero limitado, servicio suspendido visible, tamaño grande

- **Cajero** solo ve **Vender, Cierre y Ventas** (Fiado, Config., Productos y lo demás son del dueño). En móvil
  tiene un botón "Salir" arriba (no hay pestaña Más).
- **Servicio suspendido** (`frontend/src/plan.ts` + `AvisoPlan`/`SuspendidoModal` en `Shell.tsx`): ventana grande
  al entrar y barra roja fija con lo que debe; la caja no abre el cobro (solo consulta). AVISO = barra ámbar.
  Negocio nuevo = 7 días de prueba (`NegocioRegistroService.DIAS_PRUEBA`, V18 para los que no tenían pago).
- **Historial**: `GET /api/ventas?fecha=` necesitaba `@DateTimeFormat(ISO.DATE)`; prueba por HTTP
  `HistorialVentasWebTest`.
- **Tamaño de letra** (botón "A+", `tamano.ts`/`TamBtn.tsx`): Normal / Grande / Muy grande con `zoom` en `body`
  (menos en móvil), guardado por equipo (`kp_tam`). Cada pantalla se desplaza por dentro (`.appmain > div`), y la
  prueba responsive verifica que nada se desborde ni a lo ancho ni hacia abajo.

## 23. Nómina (menú del dueño)

- Pestaña **Nómina** (`screens/Nomina.tsx`, ícono "equipo") entre Fiado y Config. Cada trabajador muestra sueldo,
  lo que debe de fiado y lo que recibiría. **Pagar nómina**: período (sugerencias quincena/semana/mes), sueldo,
  bonos, adelantos/otros descuentos, fiado a descontar (por defecto todo lo posible), forma de pago (efectivo
  $/Bs, pago móvil, transferencia, Zelle, Binance) → recibo de 40 columnas imprimible. Historial "Pagos hechos".
- Backend: V19 `pagos_nomina` (RLS), `nomina/NominaService` (`GET /api/nomina`, `GET|POST /api/nomina/pagos`,
  solo dueño/encargado). El fiado descontado se registra en la cuenta del trabajador como abono `NOMINA`
  (`ClienteService.descontarDelSueldo`). No toca la caja. Atajos dueño: Nómina Alt+6, Config Alt+7, Más Alt+8.

## 24. Arreglos de lógica ("naranja" de la auditoría)

- **Ganancia histórica:** V20 `detalle_ventas.costo_unitario_usd` (costo al vender); reportes usan
  `COALESCE(d.costo, p.costo)`. Las devoluciones restan lo devuelto y su costo de la ganancia.
- **Ventas de la cola sin internet** (`creadoAt` > 10 min, ya cobradas): se registran con el precio que vio la
  caja (`items[].precioUsd`) y aunque falte stock (queda negativo). En vivo sigue estricto. La PWA refresca el
  catálogo cada 2 min / al volver / al reconectar y actualiza el carrito.
- **Ventas sin enviar visibles** (`screens/ColaVentas.tsx`): pastilla en el encabezado ("N sin enviar" ámbar /
  "N con error" rojo, evento `kp-cola`) → ventana con motivo del servidor, **Reintentar** y **Descartar**.
- **Turno de otro día:** `TurnoResumen.fechaApertura`; aviso en la barra del turno y en Cierre (`diasAbierto`).
- **Anulaciones:** anular compra devuelve el costo promedio; anular pago de nómina (`POST /api/nomina/pagos/{id}/
  anular {motivo}`) lo deja ANULADO y el fiado descontado vuelve a la cuenta (botón "Anular" en el recibo).
- **Límites:** no más cajas que `cajas_contratadas`; fiado bloquea la fila del cliente (sin pasar el límite con dos
  ventas a la vez); devolver "como pagó" en partes cierra exacto (sin céntimos sueltos).
- Pruebas: `CompraDevolucionTest` (backend) y `e2e/naranja.spec.ts`.
- **Pendiente (rojo de la auditoría):** dueño de turno/movimiento al cerrar/anular, token de usuario
  desactivado, acceso del cajero a reportes por API.

## 25. Lo que faltaba ("amarillo" de la auditoría) + Sección 6

- **Ticket con datos del negocio** (V21 `negocios.rif`, `mensaje_ticket`): `TicketService.encabezado` (nombre en
  mayúsculas, RIF, dirección, teléfono) y mensaje al pie. Ajustes del negocio (`screens/negocio.tsx`) edita nombre,
  RIF y mensaje con vista previa (`vistaTicket`). Correo "Pago recibido" al aprobar/registrar pago (`AdminService.avisarPago`).
- **Recargas** (V22 `recargas`, RLS; `recarga/RecargaService`): MOVISTAR/DIGITEL/MOVILNET/CANTV/SIMPLE_TV/INTER/OTRA;
  `POST|GET /api/recargas`, `POST /api/recargas/{id}/anular` (solo su caja, turno abierto). Lo cobrado entra a su
  forma de pago en el cuadre (efectivo = movimiento `RECARGA`); `comision_bs` = cobrado − recargado. PWA: botón
  **Recarga (F4)** en Vender (`screens/Recargas.tsx`).
- **Reportes por rango**: `GET /api/reportes/rango?desde&hasta` (`ReporteService.resumenEntre`: día por día, 10 más
  vendidos, recargas). Reportes: Hoy/Semana/Mes, barras por día, más vendidos, **Exportar a Excel**
  (`reporte-export.ts`, CSV con `;`, coma decimal y BOM). Pruebas de reportes usan el día de Caracas (CI corre en UTC).
- **Cuentas "a mano" en el servidor** (V23 `contabilidad_docs`, RLS, JSON + `version`):
  `GET|PUT /api/contabilidad/{libro|hojas}` (409 con lo del servidor si otro equipo guardó antes).
  `contabilidad-sync.ts` (`useDocServidor`): copia local + subida a los 1,5 s, pendiente sin internet.
- **Planes (Sección 6)** (`suscripcion/PlanCatalogo`): Bodega $25 (1 caja, +$10, máx. 3) y Bodega Pro $40 (2 cajas,
  +$8, máx. 10); mensualidad = plan + cajas extra. V24 `negocios.en_prueba`: la prueba de 7 días **vence sola sin
  gracia**; el primer pago aprobado la apaga. `GET /api/planes`, `PUT /api/mi-negocio/plan` (dueño),
  `PUT /api/admin/negocios/{id}/plan`; plan al crear negocio. PWA: `ElegirPlan.tsx` en Mi plan y en el panel admin,
  barra "Prueba gratis: te quedan N días".
- **Conector**: icono en la bandeja (`Bandeja.java`), una sola instancia, `conector/windows/instalar.ps1|.bat`
  (tarea programada al iniciar sesión que se reinicia sola).
- **Pruebas contra el servidor real**: job CI `e2e-real` (backend + Postgres reales) con `frontend/e2e-real/` y
  `playwright.real.config.ts` (`npm run e2e:real`).
- **Producción**: `ops/monitor.sh` (cada 5 min; salud HTTPS, contenedores, disco, respaldo, certificado) y
  `ops/probar-respaldo.sh` (domingos, restaura en Postgres temporal) avisan por Telegram (`ops/avisar.sh`,
  `TELEGRAM_TOKEN`/`TELEGRAM_CHAT_ID`). nginx expone `/actuator/health`.


## 26. Despliegue en Railway + clave real del rol de runtime en bases administradas

- **Railway** (`RAILWAY.md`): 3 servicios en un proyecto — Postgres (plugin administrado),
  `backend` (Dockerfile, root `backend/`) y `frontend` (Dockerfile, root `frontend/`).
  Sin Caddy (Railway da HTTPS solo en su subdominio). El frontend llega al backend por
  **red privada** de Railway (`BACKEND_HOST=<servicio>.railway.internal:${{backend.PORT}}`),
  no por su dominio público.
- **nginx del frontend ahora es un template** (`frontend/nginx.conf.template` +
  `frontend/docker-entrypoint.sh`, reemplaza al `nginx.conf` estático): arma la config en
  caliente en cada arranque con `PORT` (default 80) y `BACKEND_HOST` (default
  `backend:8080`, igual que antes para `docker-compose.prod.yml`) vía `envsubst`, y usa
  `resolver` con el DNS del propio contenedor (de `/etc/resolv.conf`) para resolver
  `BACKEND_HOST` en caliente — así si el backend todavía no existía al arrancar nginx
  (orden de arranque de Railway), igual conecta en cuanto el backend esté listo.
- **Bug real encontrado al preparar esto:** en una base ADMINISTRADA (Render, Railway,
  Vultr), el rol de runtime `kioskpos_app` se creaba con la clave de DESARROLLO
  `kioskpos_app_dev` **para siempre** — `db/init/02-app-password.sh` (que la pone real
  desde `DB_APP_PASSWORD`) solo corre con el Postgres oficial de Docker
  (`docker-entrypoint-initdb.d`), nunca en una base administrada, donde no controlas el
  contenedor de Postgres. Arreglado: `beforeMigrate.sql` ahora también hace
  `ALTER ROLE kioskpos_app PASSWORD '${kioskposAppPassword}'` (placeholder de Flyway,
  `spring.flyway.placeholders.kioskposAppPassword` = `DB_APP_PASSWORD` en
  `application.yml`) en CADA arranque, no solo al crear el rol — sincroniza la clave real
  en cualquier despliegue, sin tocar el flujo de Docker local (mismo valor, es un no-op).

## 27. Crédito (antes "Fiado"), botón Atrás, factura por número y productos por bloques

- **Nombre:** en la interfaz y el ticket "Fiado" pasó a **"Crédito"** (solo textos; el método `FIADO`, la API y
  los ids de pestaña siguen iguales).
- **Botón Atrás** (`frontend/src/atras.ts` + `Shell.tsx`): la pestaña vive en la URL (`#/reportes`, `#/fiado`…),
  Atrás vuelve a la anterior; cualquier `.modal`/`.overlay` abierta se cierra con Atrás (sin dejar entradas de
  más); el cobro de la Caja usa `useAtras`.
- **Crédito a empleados + factura:** al cobrar, la pantalla final y el ticket muestran el **N° de factura** que
  da el servidor (`api.ts facturaDe(codigoUnico)`; sin internet: "se numera al enviarse"). El selector de
  crédito filtra Todos/Clientes/**Empleados**. En Crédito, **Buscar factura** (`screens/Factura.tsx`, usa
  `GET /api/ventas/buscar?numero=` + `/detalle`) muestra productos, fecha, caja, total, pagos y a quién quedó el
  crédito; cada compra a crédito en la cuenta tiene **Ver factura**.
- **Productos por bloques** (V25 `producto_presentaciones` con RLS, `inventario/PresentacionService`):
  Cigarros → "Caja" trae 20 a $5, "Media caja" 10 a $2,60; suelto = el producto. Para peso/medida la cantidad
  puede ser decimal (saco de 25 kg). `GET /api/inventario/presentaciones`, `PUT /api/inventario/productos/{id}/
  presentaciones` (lista completa, solo dueño/encargado). Venta: `items[].presentacionId`; la línea guarda
  `cantidad` = bloques, precio del bloque, nombre "Producto (Caja x20)" y **`detalle_ventas.unidades`** (V25):
  el stock se mueve `cantidad × unidades` al vender, **anular** y **devolver**; el costo de la línea es
  costo × unidades (ganancia correcta). PWA: editor en Inventario → Editar (`screens/Bloques.tsx`, sugerencias
  Caja/Media caja/Bulto/Paquete), y en la Caja tocar un producto con bloques abre "¿Cómo se lo
  lleva?" (teclas 1..n); el código de barras de un bloque lo agrega directo. Copia local `kp_bloques` para vender
  sin internet. Prueba: `PresentacionVentaTest` (CI) + `e2e/bloques.spec.ts`, `e2e/factura.spec.ts`.
- **Pendiente:** "Dar a crédito" desde el perfil del cliente todavía vende solo por unidad (la venta normal con
  crédito sí admite bloques).

## 28. Ticket con formato Cocoa + tickets de cierre del punto

- **Ticket de venta** con el formato de Bodegas Cocoa (`TicketService.armar`, y el mismo en la PWA `src/ticket.ts`
  para la vista previa de la caja y de Ajustes): líneas `=` arriba y abajo del encabezado (nombre + **frase bajo
  el nombre** = `negocios.mensaje_ticket`, ej. "DIOS TODO PODEROSO", + RIF/dirección/teléfono), `FECHA : dd/MM/yyyy
  hh:mm a. m.`, `FACTURA #: 000001`, `CLIENTE: Consumidor Final` (o el de crédito), `CANT  DESCRIPCION  PRECIO (Bs)`,
  cada producto en MAYÚSCULAS con `(cant x Bs. unit)` y su total, `TOTAL EN BOLIVARES`, `FORMA DE PAGO` (`PUNTO
  VES 315,00`…, vuelto). Ya no hay pie ni total en $. Pruebas: `TicketFormatoTest` (Java) y `ticket.test.ts`.
- **Tickets de cierre del punto / Biopago** (**V26** `cierres_punto`, RLS; `cuadre/CierrePuntoService`):
  comercio (titular), afiliado, lotes crédito/débito/Master-Visa, fecha/hora del ticket y 3 secciones (Tarjeta
  crédito, Tarjeta débito, Debit Master/Visa) con compras y anulaciones (suma y monto); total = compras −
  anulaciones. `POST /api/cierres-punto` (la caja: se ata a su turno abierto; dueño/encargado: sin turno),
  `GET /api/cierres-punto/turno/{id}`, `GET /api/cierres-punto?desde&hasta` (**solo dueño/encargado**, trae caja,
  cajero y lo que el sistema registró por ese medio en el turno), `DELETE /api/cierres-punto/{id}` (caja: solo los
  de su turno abierto; dueño: cualquiera).
- **PWA:** en **Cierre** la tarjeta "Tickets de cierre del punto" (`screens/CierresPunto.tsx`, formulario en el
  mismo orden que el papel; recuerda comercio/afiliado por equipo; el lote de crédito se copia a los otros dos);
  al guardar, "Contaste" de Punto/Biopago se llena con el total; si hubo ventas por punto/Biopago y no se anotó su
  ticket, cerrar pide confirmar ("Cerrar sin ticket"). Dueño: pestaña **Puntos** (Alt+8; Más pasó a Alt+9) con
  Hoy/Ayer/7 días/Este mes/un día, agrupado por día con fecha, día y hora, el ticket como el papel y la
  diferencia contra el sistema. Pruebas: `CierrePuntoTest` (CI) y `e2e/puntos.spec.ts`.

## 29. Recargas y avances dentro de la venta + personal como trabajador

- **Recargas y avances de efectivo se cobran JUNTO con los productos** (una sola cuenta, el cliente paga como
  quiera). `POST /api/ventas` acepta `servicios: [{tipo: RECARGA, operadora, numero, montoBs, cobradoBs} |
  {tipo: AVANCE, entregaMoneda USD/VES, entregaMonto, cobradoBs}]` (`VentaService.validarServicio`). Cada uno es
  una línea de la venta con su **monto exacto en Bs** (V27 `detalle_ventas.monto_bs` + `servicio`); con servicios
  el total manda en Bs (`CobroCalculadora.calcular(totalUsd, totalBsExacto, …)`, igual en la PWA
  `cobroCalc.ts` con `totalBsFijo`). Además se registra la recarga (`RecargaService.registrarDeVenta`) y el avance
  (`MovimientoCajaService.registrarAvanceDeVenta`, sale efectivo de la gaveta, valida que alcance en vivo) con
  `metodo_cobro = 'VENTA'` y `venta_id` (V27): el cuadre NO vuelve a sumar lo cobrado (ya está en los pagos de la
  venta) pero sí resta el efectivo del avance y cuenta las comisiones. La línea de servicio lleva costo = cobrado
  (la ganancia va por su comisión, sin contarla dos veces). **Anular la venta** anula su recarga y su avance; las
  líneas de servicio **no se devuelven**. Recargas/avances de una venta no se anulan por separado.
- **Comisiones por defecto** en Configuración ("Recargas y avances de efectivo"): V27
  `negocios.comision_recarga_pct` (20) y `comision_avance_pct` (10), en `GET|PUT /api/mi-negocio/caja-config`.
- **PWA:** en Vender, **Recarga (F4)** y **Avance (F6)** (`screens/Recargas.tsx`: `Recargas`, `AvanceEfectivo`)
  ya no preguntan "¿cómo te paga?": "Agregar a la venta · Bs X" pone la línea en el ticket (se quita con ✕). El
  botón Avance salió de "Movimientos de caja" en el Cierre.
- **Personal = trabajadores** (`cliente/TrabajadorSyncService`, V27 `clientes.usuario_id`): cada cajero/encargado
  activo tiene su ficha TRABAJADOR (se crea o se liga por nombre al listar Crédito o Nómina), así sale al dar
  crédito al cobrar (selector con pestañas Todos | Clientes | **Trabajadores**) y en Nómina, donde se le descuenta.
- Pruebas: `ServiciosEnVentaTest` (CI), `e2e/servicios.spec.ts`; probado contra Postgres real.

## 30. Editar/eliminar equipo y sesión más larga

- **Sesión larga:** `kioskpos.jwt.ttl-minutes` default 720→**129600 (90 días)** (JwtService + application.yml), para
  que no se cierre la sesión del dueño/cajero a diario. Override por `KIOSKPOS_JWT_TTL_MINUTES`.
- **Editar/eliminar usuarios y cajas** (pestaña Más → "Equipo y cajas", `screens/Usuarios.tsx`):
  `PUT/DELETE /api/usuarios/{id}` y `PUT/DELETE /api/cajas/{id}` (solo dueño/encargado, SecurityConfig).
  `UsuarioService.editar` (nombre + PIN del cajero o clave del dueño/encargado; no cambia rol; Soporte no se edita)
  y `borrar` (desactiva usuario + su `cuenta_login`; `desactivar` ya impedía quedarse sin dueño activo).
  `CajaService.renombrar` y `borrar` (desactiva la caja y **borra su CajaToken** → libera cupo del plan; el equipo
  debe registrarse de nuevo). En la UI cada fila trae Editar/Eliminar; el dueño y Soporte no se editan/borran, ni
  uno a sí mismo. Prueba: `e2e/equipo.spec.ts`; verificado contra Postgres real.

## 31. Inventario CSV (import archivo + export) + eliminar producto + enlaces con sesión

- **Importar CSV desde archivo** (`screens/Inventario.tsx` FormCsv): botón "Elegir archivo CSV" (`<input type=file>`
  → textarea) además de pegar/editar; botón "Importar N producto(s)". Columnas:
  codigo_barras,nombre,precio_usd,costo_usd,categoria,stock,stock_minimo (upsert por código).
- **Exportar CSV** (`exportarCsv`, botón "Exportar" en la barra): descarga `inventario-YYYY-MM-DD.csv` con esas mismas
  columnas (BOM + CRLF, escape de comas/comillas), para editar en Excel y reimportar.
- **Bug corregido:** `InventarioService.importarCsv` intercambiaba **stock** y **stock_minimo** (num(c,6)↔num(c,5));
  ahora stock=col 5, stock_minimo=col 6. Aserción en `InventarioServiceTest.importarCsvHaceUpsert`.
- **Eliminar producto** (FormAjuste → botón "Eliminar producto", `DELETE /api/inventario/productos/{id}` ya existía;
  nueva `api.ts eliminarProducto`): borra "para siempre" (desenlaza líneas de venta, que guardan nombre/monto).
- **Enlaces con sesión abierta** (`App.tsx`): un `#caja=TOKEN` (emparejar caja) o `#reset=TOKEN` (clave nueva) ahora
  lleva SIEMPRE a la pantalla de entrada aunque ya haya sesión (antes el link "no hacía nada" si estabas logueado):
  `linkDeEntrada` arranca sin sesión y cierra la guardada sin borrar el hash, para que Login lo lea.
- Pruebas: `e2e/inventario2.spec.ts` (eliminar, importar archivo, exportar) y `e2e/link.spec.ts`; verificado contra Postgres real.

## 32. Cajeros a la vista en el inicio del dueño

- **Tarjeta "Tus cajeros"** (`screens/Cajeros.tsx`) arriba de Reportes (solo dueño/encargado, donde ya va
  `PrimerosPasos`): al entrar con la cuenta de dueño ve la lista de sus cajeros (nombre + "entra con PIN"), con
  Editar/Eliminar por fila (reusa `editarUsuario`/`borrarUsuario`). **Agregar cajero** abre un formulario corto
  (nombre + PIN 4 dígitos → `crearUsuario({rol:"CAJERO"})`). Si no hay cajeros, estado vacío con "Agrega mi primer
  cajero" (y aviso de crear una caja primero si tiene 0). Pie con el cupo del plan: "Tu plan permite N caja(s),
  tienes M registrada(s)" (de `miSuscripcion().cajasContratadas` + `listarCajas`) y enlace a Equipo y cajas.
- Pruebas: `e2e/cajeros.spec.ts`; verificado contra Postgres real.

## 33. Elegir impresora en Configuración

- **Sección "Impresora"** en Configuración (`screens/Configuracion.tsx`, componente `Impresora`): lee
  `GET /estado` del Conector (que YA devolvía `defecto:` + lista `- nombre`) vía `conector.ts estadoConector()`,
  muestra las impresoras que detecta y deja elegir en cuál imprimir ("La del sistema" por defecto, o una de la
  lista). La elección se guarda **solo en el equipo** (`localStorage kp_impresora`, `getImpresora/setImpresora`);
  `imprimirTicket`/`abrirGaveta` ya la toman por defecto si no reciben una. Botones **Buscar de nuevo** e
  **Imprimir prueba**. Si el Conector no está abierto, explica que es el programa local y ofrece reintentar.
- No cambió el Conector Java (`/estado` ya listaba impresoras con `Impresora.listar()`). Pruebas: `e2e/impresora.spec.ts`.

## 34. Vaciar inventario, facturas de proveedor (abonos + foto + vencimiento) y campanita de avisos

- **Vaciar inventario** (`InventarioService.eliminarTodo`, `DELETE /api/inventario/productos`, solo dueño/encargado):
  botón **Vaciar** (rojo) en la barra de Productos; pide confirmar escribiendo **BORRAR**. Borra todo "para siempre"
  (desenlaza cada producto de sus líneas de venta, que conservan nombre/monto). `api.ts vaciarInventario`.
- **Facturas de compra mejoradas** (**V28** `compras.pagado_usd` + `vence`; tablas `compra_abonos` y `compra_fotos`
  con RLS):
  - **Abonos**: una factura "por pagar" se abona poco a poco. `POST /api/compras/{id}/abonos {monto, metodo, nota}`
    (`CompraService.abonar`): baja el saldo (saldo = total − pagado), al cubrirlo queda **pagada** y sin vencimiento;
    no abona más del saldo. Botón **"Pagué todo (al contado)"** = `compraPagada(true)`. La deuda de proveedores
    (`proveedores().porPagarUsd` y el total "Por pagar") usa el **saldo**, no el total.
  - **Fecha de pago** (`vence`): al registrar "por pagar" se pide cuándo pagarla; `POST /api/compras/{id}/vencimiento`.
  - **Foto de la factura** (digitalizar): `frontend/src/foto.ts prepararFoto` toma la foto (o archivo), la reduce a
    JPEG ≤1600px y la sube en base64. `POST /api/compras/{id}/fotos {mime,datos}`, `GET .../fotos/{fotoId}` (devuelve
    datos para `<img src=data:…>`), `DELETE .../fotos/{fotoId}`. Hasta 6 por factura; `columnDefinition="text"` (no @Lob).
    En **Registrar compra** y en el detalle: cámara (`<input type=file accept=image/* capture>`), miniaturas y visor.
  - El detalle de compra muestra saldo, abonos, vencimiento y fotos. `CompraVista` ahora trae `abonos`, `fotos`
    (metadatos sin bytes) y `saldoUsd`.
- **Campanita de avisos** (`GET /api/avisos`, `aviso/AvisoController`, solo dueño/encargado; `screens/Campana.tsx` en
  el encabezado del dueño): junta **pagos a proveedores pendientes** (con su fecha de pago; ordena por vencer, marca
  vencidas) y **productos bajo stock / agotados**. Badge con el total (rojo si hay vencidos o agotados), panel
  filtrable **Todo / Pagos / Stock**; tocar un aviso lleva a Compras o a Inventario (evento `kp-sub-productos`).
  Se refresca al cambiar inventario/compras (evento `kp-avisos`), al enfocar la ventana y cada 3 min.
- Pruebas: `CompraDevolucionTest` (abonos, foto), `InventarioServiceTest` (vaciar), `e2e/compras-avisos.spec.ts`
  (5). Verificado contra Postgres real (V28 aplica, abonos/foto/avisos/vaciar por API).

## 35. Registro por cuenta propia, cajas desde la cuenta del dueño y bienvenida

- **Registro propio** (`auth/RegistroPublicoService`, `POST /api/auth/registro {negocio, nombre, telefono?, email,
  password}`, público): crea negocio + local + dueño (+ Soporte visible) con la **prueba de 7 días**, plan BASICO y
  1 caja, manda el correo de bienvenida y devuelve la sesión ya iniciada. Valida TODO antes de crear (correo válido,
  clave ≥ 8, correo no usado → así no quedan negocios huérfanos) y limita altas por IP (`X-Real-IP`):
  `kioskpos.registro.max-por-hora` (5). Se apaga con `KIOSKPOS_REGISTRO_ABIERTO=false`.
- **PWA:** en la entrada, tarjeta "¿Tu bodega aún no tiene cuenta? **Crear mi cuenta**" → formulario (bodega, tu
  nombre, WhatsApp opcional, correo, clave ×2). Al registrarse marca `kp_bienvenida` y entra.
- **Bienvenida** (`screens/Bienvenida.tsx`, en `Shell` solo para el dueño, una sola vez): saludo + 7 días gratis +
  3 pasos: **Usar este equipo** como caja (lo hace ahí mismo), agregar cajeros, cargar productos.
- **Cajas sin token** (`src/esteEquipo.ts`: `usarEsteEquipoComoCaja`, `adoptarCaja`, `cajaLocalId` en `kp_caja_local`):
  el dueño crea la caja desde su cuenta y el token se guarda en ESE equipo (al salir, abre en "¿Quién va a cobrar?").
  En Equipo y cajas, "+ Caja" pregunta **En este equipo / En otro equipo** (este último da el enlace, y ahí también
  "Mejor uso este equipo"); la lista marca **Este equipo**. La tarjeta "Tus cajeros" del inicio muestra **Tus cajas**
  y el botón "Usar este equipo como caja" si hay cupo.
- Pruebas: `RegistroPublicoTest` (CI) y `e2e/registro.spec.ts` (3). Verificado contra Postgres real.
