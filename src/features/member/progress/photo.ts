/**
 * Shrinks a chosen photo to at most 1,000 px on its long side and saves it as a JPEG, so a progress photo is a few hundred
 * kilobytes, not a camera original. Runs in the browser; the result is a data URL.
 */
export async function shrinkPhoto(file: File, maxSide = 1000, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can’t prepare photos.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
