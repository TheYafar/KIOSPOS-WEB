/**
 * El "día" del negocio es el de Venezuela (America/Caracas), igual que en el servidor,
 * aunque el equipo tenga otra zona horaria. Formato AAAA-MM-DD.
 */
export const ZONA = "America/Caracas";
export const diaVe = (d: Date = new Date()): string => d.toLocaleDateString("en-CA", { timeZone: ZONA });
export const hoyVe = (): string => diaVe();
/** El día de Venezuela n días antes de hoy. */
export function hace(n: number, ahora: Date = new Date()): string {
  const d = new Date(diaVe(ahora) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
