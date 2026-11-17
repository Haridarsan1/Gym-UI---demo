/**
 * Service worker registration. Called when the app opens (never from the marketing pages), in production builds only.
 *
 * The service worker updates itself and takes over as soon as a new version is ready, so the next page load is always
 * current. We don’t reload the page for you, because you might be in the middle of logging a workout. Instead
 * `onUpdate` is called so a toast can offer a reload.
 */
const HOUR_MS = 60 * 60 * 1000;

export function registerServiceWorker(onUpdate: () => void): void {
  if (import.meta.env.DEV || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  void import("workbox-window").then(({ Workbox }) => {
    const wb = new Workbox("/sw.js");
    // "controlling" with isUpdate means a newer worker has replaced the one that was running for this page.
    wb.addEventListener("controlling", (event) => {
      if (event.isUpdate) onUpdate();
    });
    void wb.register().then((registration) => {
      // Browsers check for a new worker when a page loads. Also check when the app comes back to the front, at most hourly.
      let last = Date.now();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible" || Date.now() - last < HOUR_MS) return;
        last = Date.now();
        void registration?.update();
      });
    });
  });
}
