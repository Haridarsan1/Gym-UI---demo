import { useEffect, useRef } from "react";
import { registerServiceWorker } from "@/app/pwa";
import { useToast } from "@/design/Toast";

/**
 * Registers the service worker and shows “New version available” when a deploy lands while the app is open.
 * The same toast appears if a screen’s code can’t be fetched because a deploy replaced it.
 */
export function UpdateWatcher() {
  const toast = useToast();
  const shown = useRef(false);

  useEffect(() => {
    const announce = () => {
      if (shown.current) return;
      shown.current = true;
      toast({
        title: "New version available",
        description: "Reload to get the latest changes.",
        action: { label: "Reload", onAction: () => window.location.reload() },
        duration: null,
      });
    };
    registerServiceWorker(announce);
    // Vite fires this when a lazy screen’s file is gone (a new deploy removed the old one).
    window.addEventListener("vite:preloadError", announce);
    return () => window.removeEventListener("vite:preloadError", announce);
  }, [toast]);

  return null;
}
