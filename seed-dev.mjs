#!/usr/bin/env node
// =============================================================================
// Seed de DESARROLLO para KioskPOS Web.
//
// Crea datos de demo con credenciales CONOCIDAS para probar la app en local:
//   - un negocio "Bodega Demo" con su dueño,
//   - un encargado,
//   - dos cajeros (entran con PIN),
//   - una caja registrada (imprime su token),
//   - un catálogo de productos.
//
// NO es para producción (son credenciales de demo). Requiere el backend
// corriendo y el super admin de arranque ya creado (KIOSKPOS_BOOTSTRAP_*).
//
// Uso:
//   node seed-dev.mjs
//   BASE_URL=http://localhost:8080 SA_EMAIL=uriel@kioskpos.com SA_PASS=superadmin123 node seed-dev.mjs
// =============================================================================

const BASE = process.env.BASE_URL || "http://localhost:8080";
const SA_EMAIL = process.env.SA_EMAIL || "uriel@kioskpos.com";
const SA_PASS = process.env.SA_PASS || "superadmin123";

const CRED = {
  negocio: "Bodega Demo",
  dueno: { nombre: "Uriel Dueño", email: "dueno@bodegademo.com", pass: "dueno123456" },
  encargado: { nombre: "Carlos Encargado", email: "encargado@bodegademo.com", pass: "encargado123" },
  cajeros: [
    { nombre: "Ana Pérez", pin: "1234" },
    { nombre: "José Marín", pin: "5678" }
  ],
  caja: "Caja 1"
};

const CSV = `codigo_barras,nombre,precio_usd,costo_usd,categoria,stock,stock_minimo
7591001,Harina PAN 1 kg,1.40,1.00,Viveres,120,10
7591002,Arroz Mary 1 kg,1.30,1.00,Viveres,8,10
7591003,Pasta Primor 1 kg,1.50,1.15,Viveres,60,10
7591004,Azucar 1 kg,1.10,0.85,Viveres,40,10
7591005,Aceite Diana 1 L,3.20,2.55,Viveres,45,8
7591006,Caraotas negras 500 g,1.20,0.95,Viveres,0,8
7591007,Cafe molido 250 g,3.40,2.50,Viveres,22,6
7591008,Leche en polvo 400 g,5.90,4.80,Viveres,18,6
7591101,Refresco 2 L,1.80,1.40,Bebidas,60,12
7591102,Malta 355 ml,0.90,0.65,Bebidas,80,12
7591103,Agua mineral 1.5 L,0.80,0.55,Bebidas,50,10
7591201,Queso blanco,5.50,4.40,Charcuteria,14,5
7591202,Jamon de pierna,7.80,6.30,Charcuteria,9,4
7591301,Galleta Maria,0.70,0.50,Chucherias,70,15
7591401,Pan canilla,0.50,0.30,Panaderia,40,10
7591501,Jabon de baño,1.00,0.70,Limpieza,33,8`;

async function call(method, path, token, body, textBody) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (textBody != null) headers["Content-Type"] = "text/plain";
  else if (body != null) headers["Content-Type"] = "application/json";
  const resp = await fetch(BASE + path, { method, headers, body: textBody != null ? textBody : body != null ? JSON.stringify(body) : undefined });
  const txt = await resp.text();
  const json = txt ? JSON.parse(txt) : null;
  if (!resp.ok) throw new Error(`${method} ${path} → ${resp.status}: ${json?.error || txt}`);
  return json;
}

async function main() {
  console.log("Backend:", BASE);

  // 1. Super admin
  const admin = await call("POST", "/api/admin/login", null, { email: SA_EMAIL, password: SA_PASS });
  console.log("✓ Super admin autenticado:", SA_EMAIL);

  // 2. Negocio + dueño
  let negocioId;
  try {
    const neg = await call("POST", "/api/admin/negocios", admin.token, {
      nombreNegocio: CRED.negocio, nombreDueno: CRED.dueno.nombre, email: CRED.dueno.email, password: CRED.dueno.pass
    });
    negocioId = neg.negocioId;
    console.log("✓ Negocio creado:", CRED.negocio, "(#" + negocioId + ")");
  } catch (e) {
    if (String(e).includes("Ya existe")) { console.log("• El negocio/dueño ya existía, sigo."); }
    else throw e;
  }

  // 3. Dueño
  const dueno = await call("POST", "/api/auth/login-dueno", null, { email: CRED.dueno.email, password: CRED.dueno.pass });
  console.log("✓ Dueño autenticado:", CRED.dueno.email);

  // 3b. Activar la suscripción: un negocio nuevo nace sin pago (kill switch →
  //     no puede cobrar). El dueño reporta un pago y el super admin lo aprueba,
  //     así la caja queda habilitada para cobrar en la demo.
  const sit = await call("GET", "/api/mi-negocio/suscripcion", dueno.token).catch(() => null);
  if (!sit || !sit.puedeCobrar) {
    const pago = await call("POST", "/api/mi-negocio/pagos", dueno.token, { monto: 25, moneda: "USD", metodo: "PAGO_MOVIL", referencia: "SEED-0001", meses: 1 });
    await call("POST", `/api/admin/pagos/${pago.id}/aprobar`, admin.token);
    console.log("✓ Pago de demo reportado y aprobado — negocio ACTIVO (puede cobrar).");
  } else {
    console.log("• El negocio ya puede cobrar, no reporto pago.");
  }

  // 4. Encargado (ignora si ya existe)
  try {
    await call("POST", "/api/usuarios", dueno.token, { rol: "ENCARGADO", nombreCompleto: CRED.encargado.nombre, email: CRED.encargado.email, password: CRED.encargado.pass });
    console.log("✓ Encargado creado:", CRED.encargado.email);
  } catch (e) { console.log("• Encargado:", String(e.message).slice(0, 60)); }

  // 5. Cajeros
  for (const c of CRED.cajeros) {
    try {
      await call("POST", "/api/usuarios", dueno.token, { rol: "CAJERO", nombreCompleto: c.nombre, pin: c.pin });
      console.log(`✓ Cajero creado: ${c.nombre} (PIN ${c.pin})`);
    } catch (e) { console.log(`• Cajero ${c.nombre}:`, String(e.message).slice(0, 60)); }
  }

  // 6. Caja (token se muestra UNA vez)
  let cajaToken = "(ya existía — recrea o míralo del panel del dueño)";
  const cajas = await call("GET", "/api/cajas", dueno.token).catch(() => []);
  if (!cajas || cajas.length === 0) {
    const caja = await call("POST", "/api/cajas", dueno.token, { nombre: CRED.caja });
    cajaToken = caja.cajaToken;
    console.log("✓ Caja creada:", CRED.caja);
  } else {
    console.log("• Ya hay", cajas.length, "caja(s); no recreo para no perder su token.");
  }

  // 7. Productos
  const imp = await call("POST", "/api/inventario/importar", dueno.token, null, CSV);
  console.log(`✓ Productos importados: ${imp.creados} nuevos, ${imp.actualizados} actualizados`);

  // Resumen
  console.log("\n================= CREDENCIALES DE DEMO =================");
  console.log("Super admin :", SA_EMAIL, "/", SA_PASS);
  console.log("Dueño       :", CRED.dueno.email, "/", CRED.dueno.pass);
  console.log("Encargado   :", CRED.encargado.email, "/", CRED.encargado.pass);
  CRED.cajeros.forEach((c) => console.log("Cajero      :", c.nombre, "→ PIN", c.pin));
  console.log("Token de la caja (pégalo al configurar la caja en la pantalla de entrada):");
  console.log("  ", cajaToken);
  console.log("=======================================================");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
