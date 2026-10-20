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
- **Paso 7 — Cuadre (apertura + cierre simple):** pendiente (siguiente).
