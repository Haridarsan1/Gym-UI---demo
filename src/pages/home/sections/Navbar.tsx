import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useSpring } from "framer-motion";
import { Menu, X } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { navLinks } from "@/data/content";
import { brand } from "@/config/brand";
import { cn } from "@/lib/format";

/** Floating nav with a reading-progress line along its bottom edge. */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:px-6">
      <div
        className={cn(
          "relative mx-auto max-w-page overflow-hidden rounded-[1.6rem] bg-white/85 text-clay-ink shadow-[inset_0_1.5px_0_#fff,inset_0_-3px_0_rgba(35,28,53,0.05),0_18px_40px_-18px_rgba(10,15,28,0.45)] backdrop-blur-xl",
        )}
      >
        <div className="flex h-16 items-center justify-between gap-6 pl-5 pr-2.5">
          <Link to="/" aria-label={`${brand.name} home`} className="rounded-md">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1 text-[0.95rem] text-clay-muted">
              {navLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="block rounded-full px-4 py-2 transition-colors hover:bg-clay-canvas hover:text-clay-ink">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Link to="/login" className="rounded-full px-4 py-2 text-[0.95rem] font-medium text-clay-muted hover:text-clay-ink">
              Log in
            </Link>
            <ButtonLink to="/signup" variant="primary">
              Start free trial
            </ButtonLink>
          </div>
          <button
            type="button"
            className="clay-flat grid h-11 w-11 place-items-center !rounded-full lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div id="mobile-menu" className="border-t border-clay-line px-5 pb-5 lg:hidden">
            <ul>
              {navLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setOpen(false)} className="block border-b border-clay-line py-3.5 text-lg">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <ButtonLink to="/login" variant="clay" size="lg" onClick={() => setOpen(false)}>
                Log in
              </ButtonLink>
              <ButtonLink to="/signup" variant="primary" size="lg" onClick={() => setOpen(false)}>
                Start free trial
              </ButtonLink>
            </div>
          </div>
        )}
        {/* Reading progress along the bottom of the pill */}
        <motion.span aria-hidden="true" style={{ scaleX: progress }} className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-[linear-gradient(90deg,#FFA778,#FC5200)]" />
      </div>
    </header>
  );
}
