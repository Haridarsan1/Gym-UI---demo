import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, RotateCcw, Shuffle } from "lucide-react";
import { useMe } from "@/api/hooks";
import { menuFor, screenPath } from "@/app/navigation";
import { useCan, useSession } from "@/app/SessionContext";
import { useResetDemo, useSignOut, useSwitchAccount } from "@/app/useSessionActions";
import { FEATURED_ACCOUNTS } from "@/app/demoSignIn";
import { DEMO_MODE } from "@/app/mode";
import { Avatar } from "@/design/Avatar";
import { ROLE_LABEL, areaFor } from "@/domain/roles";

/**
 * The avatar in the top bar. Opens a panel with who you are, the “Me” links for the member and trainer apps,
 * a demo reset, and Sign out. Present in every shell.
 */
export function AvatarMenu() {
  const { session } = useSession();
  const can = useCan();
  const me = useMe();
  const signOut = useSignOut();
  const resetDemo = useResetDemo();
  const switchAccount = useSwitchAccount();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!session) return null;
  const area = areaFor(session.role);
  const name = me.data?.name || session.name;
  const items = area === "member" || area === "trainer" ? menuFor(area, can) : [];
  const row = "flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl px-3 text-left text-[0.95rem] hover:bg-clay-canvas";

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panelId} aria-label={`Account menu for ${name}`} className="grid h-11 w-11 place-items-center rounded-full">
        <Avatar name={name} />
      </button>
      {open && (
        <div id={panelId} className="clay absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 !rounded-2xl p-2">
          <div className="px-3 py-2">
            <p className="font-semibold">{name}</p>
            <p className="text-sm text-clay-muted">
              {ROLE_LABEL[session.role]}
              {me.data?.tenant ? `, ${me.data.tenant.name}` : ""}
            </p>
          </div>
          {items.length > 0 && (
            <ul className="border-t border-clay-line py-1">
              {items.map((s) => (
                <li key={s.id}>
                  <Link to={screenPath(area, s)} onClick={() => setOpen(false)} className={row}>
                    <s.icon className="h-5 w-5 text-clay-muted" aria-hidden="true" />
                    {s.label ?? s.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {DEMO_MODE && (
            <div className="border-t border-clay-line py-1">
              <p className="flex items-center gap-2 px-3 pb-1 pt-2 text-xs font-semibold text-clay-subtle">
                <Shuffle className="h-3.5 w-3.5" aria-hidden="true" /> Demo: switch role
              </p>
              <ul>
                {FEATURED_ACCOUNTS.filter((a) => a.userId !== session.userId).map((a) => (
                  <li key={a.userId}>
                    <button
                      type="button"
                      className={row}
                      onClick={() => {
                        setOpen(false);
                        switchAccount(a.userId);
                      }}
                    >
                      <span className="flex-1">
                        {ROLE_LABEL[a.role]}
                        <span className="block text-xs text-clay-muted">{a.name}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="border-t border-clay-line py-1">
            <button
              type="button"
              className={row}
              onClick={() => {
                setOpen(false);
                void resetDemo();
              }}
            >
              <RotateCcw className="h-5 w-5 text-clay-muted" aria-hidden="true" />
              Reset demo data
            </button>
            <button type="button" className={row} onClick={signOut}>
              <LogOut className="h-5 w-5 text-clay-muted" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
