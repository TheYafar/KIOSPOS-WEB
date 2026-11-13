// Toma una foto (del archivo que eligió o capturó el usuario), la reduce de tamaño y la
// devuelve como JPEG en base64 (sin el prefijo data:) para guardarla en el servidor.
// Así la factura del proveedor queda "digitalizada" sin pesar megabytes.

export interface FotoLista { mime: string; datos: string; }

const MAX_LADO = 1600; // px del lado más largo
const CALIDAD = 0.72;

export async function prepararFoto(file: File): Promise<FotoLista> {
  const url = URL.createObjectURL(file);
  try {
    const img = await cargar(url);
    let { width: w, height: h } = img;
    if (Math.max(w, h) > MAX_LADO) {
      const f = MAX_LADO / Math.max(w, h);
      w = Math.round(w * f);
      h = Math.round(h * f);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", CALIDAD);
    const coma = dataUrl.indexOf(",");
    return { mime: "image/jpeg", datos: coma >= 0 ? dataUrl.slice(coma + 1) : dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cargar(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la foto"));
    img.src = src;
  });
}
