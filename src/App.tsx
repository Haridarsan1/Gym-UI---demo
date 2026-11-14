import { lazy, Suspense, useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import HomePage from "@/pages/home/HomePage";
import { scrollToId } from "@/lib/scroll";

const TrialSignupPage = lazy(() => import("@/pages/signup/TrialSignupPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const AppPlaceholder = lazy(() => import("@/pages/AppPlaceholder"));
const LegalPage = lazy(() => import("@/pages/LegalPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/**
 * Scroll handling between pages.
 * In-page anchor links (#pricing) are left to the browser so its smooth scroll isn't interrupted.
 * When arriving from another page (e.g. /signup → /#pricing), scroll to the anchor once the page has rendered.
 */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    const cameFromOtherPage = previousPath.current !== null && previousPath.current !== pathname;
    const firstLoad = previousPath.current === null;
    previousPath.current = pathname;
    if (!cameFromOtherPage && !firstLoad) return;
    if (hash) {
      // Jump once the page has rendered, then again after fonts and pinned sections have settled.
      const jump = () => {
        const el = document.getElementById(hash.slice(1));
        if (!el) return;
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 96));
        document.documentElement.style.scrollBehavior = "";
      };
      const timers = [80, 450, 1000].map((ms) => window.setTimeout(jump, ms));
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    if (cameFromOtherPage) window.scrollTo(0, 0);
  }, [pathname, hash]);

  /* In-page anchor links (#pricing, /#pricing while on the home page) use our own smooth scroll. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      const match = href.match(/^\/?#([\w-]+)$/);
      if (!match || window.location.pathname !== "/") return;
      if (!document.getElementById(match[1])) return;
      e.preventDefault();
      window.history.pushState(null, "", `#${match[1]}`);
      scrollToId(match[1]);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Suspense fallback={<div className="min-h-screen bg-clay-canvas" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/signup" element={<TrialSignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app/*" element={<AppPlaceholder />} />
          <Route path="/privacy" element={<LegalPage title="Privacy policy" />} />
          <Route path="/terms" element={<LegalPage title="Terms of service" />} />
          <Route path="/refunds" element={<LegalPage title="Refund policy" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
