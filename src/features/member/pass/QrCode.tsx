import { useMemo } from "react";
import QRCode from "qrcode";

/**
 * A QR code drawn as one SVG path: sharp at any size, black on white with the quiet border scanners need, and no image to load.
 * `label` names it for screen readers; the value itself is never spoken.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const border = 4;
    let d = "";
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (!qr.modules.get(y, x)) {
          x++;
          continue;
        }
        let run = 1;
        while (x + run < n && qr.modules.get(y, x + run)) run++;
        d += `M${x + border} ${y + border}h${run}v1h-${run}z`;
        x += run;
      }
    }
    return { size: n + border * 2, path: d };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={className} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
