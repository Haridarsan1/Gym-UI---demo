/**
 * Service worker registration. Called when the app opens (never from the marketing pages), in production builds only.
 *
 * The service worker updates itself and takes over as soon as a new version is ready, so the next page load is always
 * current. We don’t reload the page for you, because you might be in the middle of logging a workout. Instead
 * `onUpdate` is called so a toast can offer a reload.
 *
 * This uses the browser’s own service worker API rather than `workbox-window`, which would add 2.3 KB to every
 * app route’s first download for one event.
 */
const HOUR_MS = 60 * 60 * 1000;

export function registerServiceWorker(onUpdate: () => void): void {
  if (import.meta.env.DEV || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  // A new worker taking over a page that already had one is an update. The first install also takes over (clientsClaim), which is not.
  let hadController = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    if (hadController) onUpdate();
    hadController = true;
  });
  void sw.register("/sw.js").then((registration) => {
    // Browsers check for a new worker when a page loads. Also check when the app comes back to the front, at most hourly.
    let last = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || Date.now() - last < HOUR_MS) return;
      last = Date.now();
      void registration.update();
    });
  }).catch(() => undefined);
}
