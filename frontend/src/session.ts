/**
 * Sesión del usuario y configuración de la caja, en localStorage. Hay dos niveles:
 *  - Caja (dispositivo): el token de la caja se configura UNA vez (lo da el dueño al
 *    registrar la caja) y es de larga vida.
 *  - Usuario: el JWT de sesión (cajero o dueño) que caduca; y el permiso de cobro,
 *    corto, que se renueva.
 */

export type Rol = "DUENO" | "ENCARGADO" | "CAJERO" | "SOPORTE" | "SUPER_ADMIN";

export interface Sesion {
  token: string;
  rol: Rol;
  usuarioId: number;
  negocioId: number;
  cajaId: number | null;
  nombre: string;
}

const S_KEY = "kioskpos.sesion";
const CAJA_KEY = "kioskpos.cajaToken";
const PERMISO_KEY = "kioskpos.permiso";
const TASA_KEY = "kioskpos.tasa";

function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function set(key: string, val: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* modo privado */
  }
}
function del(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignorar */
  }
}

export const getSesion = () => get<Sesion>(S_KEY);
export const setSesion = (s: Sesion) => set(S_KEY, s);
export const cerrarSesion = () => {
  del(S_KEY);
  del(PERMISO_KEY);
};

export const getCajaToken = () => get<string>(CAJA_KEY) ?? "";
export const setCajaToken = (t: string) => set(CAJA_KEY, t);

export const getPermiso = () => get<string>(PERMISO_KEY) ?? "";
export const setPermiso = (p: string) => set(PERMISO_KEY, p);

export const getTasa = () => get<string>(TASA_KEY) ?? "40";
export const setTasa = (t: string) => set(TASA_KEY, t);

const TURNO_KEY = "kioskpos.turno";
export const getTurnoId = () => get<number>(TURNO_KEY);
export const setTurnoId = (id: number | null) => (id == null ? del(TURNO_KEY) : set(TURNO_KEY, id));
