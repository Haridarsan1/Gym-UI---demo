import { useEffect, useRef, useState } from "react";
import { Camera, Keyboard } from "lucide-react";
import { Button3D } from "@/design/Button3D";

interface Detector {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
}

/**
 * The camera QR scanner (M05). It is loaded only when the desk presses “Scan QR”, so the first download has no scanner in it. It uses the
 * browser’s own `BarcodeDetector` where there is one, and the ZXing reader (loaded on demand too) where there isn’t, such as Safari on an iPad.
 * When there is no camera, or it is refused, a pass code can be typed instead.
 */
export default function Scanner({ onToken, onCode }: { onToken: (token: string) => void; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "unavailable">("starting");
  const [message, setMessage] = useState<string>();
  const [code, setCode] = useState("");
  const last = useRef<{ token: string; at: number }>({ token: "", at: 0 });
  // The latest callback, so the camera is started once and not again every time the screen re-renders.
  const handler = useRef(onToken);
  handler.current = onToken;

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopZxing: (() => void) | undefined;
    let dead = false;
    // The same code seen on the next frames is one scan, not many.
    const found = (token: string) => {
      const t = Date.now();
      if (token === last.current.token && t - last.current.at < 4000) return;
      last.current = { token, at: t };
      handler.current(token);
    };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (dead) return stream.getTracks().forEach((t) => t.stop());
        const el = video.current!;
        el.srcObject = stream;
        await el.play().catch(() => undefined);
        setState("scanning");
        const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        if (Native) {
          const d = new Native({ formats: ["qr_code"] });
          timer = window.setInterval(async () => {
            if (el.readyState < 2) return;
            const r = await d.detect(el).catch(() => []);
            if (r[0]?.rawValue) found(r[0].rawValue);
          }, 250);
        } else {
          const { BrowserQRCodeReader } = await import("@zxing/browser");
          const reader = new BrowserQRCodeReader();
          const controls = await reader.decodeFromStream(stream, el, (result) => result && found(result.getText()));
          stopZxing = () => controls.stop();
        }
      } catch (e) {
        if (dead) return;
        setState("unavailable");
        setMessage((e as { name?: string }).name === "NotAllowedError" ? "The camera is blocked for this site. Allow it in the browser, or type the pass code." : "There is no camera here. Type the pass code instead.");
      }
    })();
    return () => {
      dead = true;
      if (timer) window.clearInterval(timer);
      stopZxing?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative aspect-square max-h-[22rem] w-full overflow-hidden rounded-3xl bg-clay-ink">
        <video ref={video} muted playsInline aria-label="Camera" className="h-full w-full object-cover" />
        {state !== "scanning" && (
          <p role="status" className="absolute inset-0 grid place-items-center p-6 text-center text-white">
            <span className="flex flex-col items-center gap-2"><Camera className="h-8 w-8" aria-hidden="true" />{state === "starting" ? "Starting the camera…" : message}</span>
          </p>
        )}
        {state === "scanning" && <div aria-hidden="true" className="pointer-events-none absolute inset-6 rounded-2xl border-4 border-white/80" />}
      </div>
      {state === "scanning" && <p className="text-center text-clay-muted">Hold the member’s pass inside the frame.</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) onCode(code.trim()); }} className="space-y-2" aria-label="Enter a code">
        <label className="block">
          <span className="flex items-center gap-2 font-semibold"><Keyboard className="h-4 w-4" aria-hidden="true" />Pass code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Code under the member’s QR" className="mt-2 h-12 w-full rounded-xl border border-clay-line px-3 focus:border-ember-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-300" />
        </label>
        <Button3D type="submit" variant="white" disabled={!code.trim()}>Find member</Button3D>
      </form>
    </div>
  );
}
