// Íconos del mockup (design/mockup.html): productos (IC) e interfaz (UI).
const IC: Record<string, string> = {
  bag: '<path d="M6.5 8.5h11l1 11.5h-13l1-11.5Z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  sack: '<path d="M8 4h8l-1.5 3c3 2 4.5 5 4.5 8a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5c0-3 1.5-6 4.5-8L8 4Z"/><path d="M9.5 7h5"/>',
  bottle: '<path d="M10 2.5h4V5l1.5 2.5V20a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 8.5 20V7.5L10 5V2.5Z"/><path d="M8.5 12h7"/>',
  can: '<path d="M7 5.5c0-1.1 2.2-2 5-2s5 .9 5 2v13c0 1.1-2.2 2-5 2s-5-.9-5-2v-13Z"/><path d="M7 5.5c0 1.1 2.2 2 5 2s5-.9 5-2"/>',
  cheese: '<path d="M3 16.5 17 8l4 5.5v5H3v-2Z"/><path d="M3 16.5h18"/><circle cx="8" cy="19" r=".6"/><circle cx="14" cy="14.5" r=".6"/>',
  bread: '<path d="M4 11.5A5.5 5.5 0 0 1 9.5 6h5A5.5 5.5 0 0 1 20 11.5c0 .9-.7 1.4-1.5 1.5V18a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-5C4.7 12.9 4 12.4 4 11.5Z"/><path d="m9 9.5 1.5 2M13 9.5l1.5 2"/>',
  soap: '<rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M7.5 10V8.5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2V10"/><circle cx="9" cy="3.5" r=".8"/><circle cx="13" cy="2.8" r=".8"/>',
  candy: '<circle cx="12" cy="12" r="4"/><path d="M8.3 10.5 4 8v8l4.3-2.5M15.7 10.5 20 8v8l-4.3-2.5"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>'
};

const UI: Record<string, string> = {
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  bills: '<rect x="2.5" y="7" width="15" height="10" rx="1.5"/><path d="M6.5 4h15v10"/><circle cx="10" cy="12" r="2"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  finger: '<path d="M12 4.5a6.5 6.5 0 0 1 6.5 6.5v2.5M5.5 13.5V11A6.5 6.5 0 0 1 8 5.8"/><path d="M9 20c.6-1.6.9-3.3.9-5v-4a2.1 2.1 0 0 1 4.2 0v2.5M12 11v4c0 2-.4 4-1.3 5.8M16.1 17c-.2 1.2-.6 2.3-1.1 3.4"/>',
  mix: '<path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/>',
  back: '<path d="m14.5 6-6 6 6 6"/>',
  del: '<path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7 6-7Z"/><path d="m12 9.5 5 5M17 9.5l-5 5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.5 3.6-5.5 7-5.5s6.2 2 7 5.5"/>',
  cart: '<path d="M4 5h2l2 10h10l2-7H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>',
  chart: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8"/>',
  more: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
  store: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M5.5 12v8h13v-8"/><path d="M10 20v-4.5h4V20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  alert: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  sol: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>',
  luna: '<path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5Z"/>'
};

export function Icono({ k, sw = 1.7 }: { k: string; sw?: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: IC[k] || IC.box }} />;
}
export function UIcono({ k, sw = 1.8 }: { k: string; sw?: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: UI[k] || "" }} />;
}

// Categoría -> {ícono, color}. Normaliza (sin acentos, minúsculas).
const CATS: Record<string, { icon: string; cat: string }> = {
  viveres: { icon: "bag", cat: "viveres" },
  bebidas: { icon: "bottle", cat: "bebidas" },
  charcuteria: { icon: "cheese", cat: "charcuteria" },
  chucherias: { icon: "candy", cat: "chucherias" },
  panaderia: { icon: "bread", cat: "panaderia" },
  limpieza: { icon: "soap", cat: "limpieza" }
};

export function catInfo(categoria: string): { icon: string; cat: string } {
  const key = (categoria || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return CATS[key] || { icon: "box", cat: "" };
}
