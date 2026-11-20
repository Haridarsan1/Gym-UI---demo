/**
 * Turns a chosen image into a logo the gym can keep: a small data URL. A PNG, JPG or WebP is drawn onto a canvas no bigger than 256 px on its longer side, so a phone photo isn’t stored whole;
 * an SVG is kept as it is if it is small. Anything else, or anything that can’t be read, is refused in words.
 */
export const MAX_LOGO_BYTES = 8 * 1024 * 1024;

const read = (file: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error("read")); r.readAsDataURL(file); });

export async function fileToLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) throw new Error("Use a PNG, JPG, WebP or SVG image.");
  if (file.size > MAX_LOGO_BYTES) throw new Error("That image is too large. Use one under 8 MB.");
  const url = await read(file);
  if (file.type === "image/svg+xml") {
    if (url.length > 300_000) throw new Error("That SVG is too large. Use one under about 200 KB, or a PNG.");
    return url;
  }
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("We couldn’t read that image. Try another file.")); img.src = url; });
  const scale = Math.min(1, 256 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
