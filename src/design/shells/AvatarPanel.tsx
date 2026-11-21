import { Link } from "react-router-dom";
import { LogOut, RotateCcw, Shuffle } from "lucide-react";
import { useNewMemberLogins, useNewStaffLogins } from "@/api/hooks";
import { menuFor, screenPath } from "@/app/navigation";
import { useCan, useSession } from "@/app/SessionContext";
import { useResetDemo, useSignOut, useSwitchAccount } from "@/app/useSessionActions";
import { FEATURED_ACCOUNTS } from "@/app/demoSignIn";
import { DEMO_ACCOUNTS, LOTUS_NAME, otherProfiles } from "@/app/demoAccounts";
import { DEMO_MODE } from "@/app/mode";
import { ROLE_LABEL, areaFor } from "@/domain/roles";
import { cn } from "@/lib/format";

/** The account menu’s panel: who you are, the “Me” links, the demo role switcher, reset and sign out. Loaded when the menu is first opened. */
export default function AvatarPanel({ id, drop, name, tenantName, close }: { id: string; drop: "down" | "up"; name: string; tenantName?: string; close: () => void }) {
  const { session } = useSession();
  const can = useCan();
  const signOut = useSignOut();
  const resetDemo = useResetDemo();
  const switchAccount = useSwitchAccount();
  const newLogins = useNewMemberLogins(DEMO_MODE);
  const newStaff = useNewStaffLogins(DEMO_MODE);
  if (!session) return null;
  const setOpen = (_open: boolean) => close();
  const area = areaFor(session.role);
  const items = area === "member" || area === "trainer" ? menuFor(area, can) : [];
  const row = "flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl px-3 text-left text-[0.95rem] hover:bg-clay-canvas";
  return (
        <div id={id} className={cn("clay absolute z-50 w-72 !rounded-2xl p-2", drop === "up" ? "bottom-[calc(100%+0.5rem)] left-0 max-h-[80dvh] overflow-y-auto" : "right-0 top-[calc(100%+0.5rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto")}>
          <div className="px-3 py-2">
            <p className="font-semibold">{name}</p>
            <p className="text-sm text-clay-muted">
              {ROLE_LABEL[session.role]}
              {tenantName ? `, ${tenantName}` : ""}
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
          {DEMO_MODE && otherProfiles(session.userId).length > 0 && (
            <div className="border-t border-clay-line py-1">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold text-clay-subtle">Switch profile</p>
              <ul aria-label="Switch profile">
                {otherProfiles(session.userId).map((a) => (
                  <li key={a.userId}>
                    <button type="button" className={row} onClick={() => { setOpen(false); switchAccount(a.userId); }}>
                      <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lilac-100 text-xs font-bold text-lilac-700">{a.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                      <span className="flex-1">{a.name}<span className="block text-xs text-clay-muted">Same phone number or email</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
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
              {(newLogins.data?.length ?? 0) > 0 && (
                <ul aria-label="New members">
                  {newLogins.data!.map((m) => (
                    <li key={m.userId}>
                      <button type="button" className={row} onClick={() => { setOpen(false); switchAccount(m.userId, m); }}>
                        <span className="flex-1">{m.name}<span className="block text-xs text-clay-muted">Member, registered in this demo</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <details className="group">
                <summary className={`${row} cursor-pointer list-none text-xs font-semibold text-clay-subtle`}>Another gym: {LOTUS_NAME}</summary>
                <ul aria-label="Another gym">
                  {DEMO_ACCOUNTS.filter((a) => a.otherGym && a.userId !== session.userId).map((a) => (
                    <li key={a.userId}><button type="button" className={row} onClick={() => { setOpen(false); switchAccount(a.userId); }}><span className="flex-1">{a.name}<span className="block text-xs text-clay-muted">{ROLE_LABEL[a.role]} at {LOTUS_NAME}</span></span></button></li>
                  ))}
                </ul>
              </details>
              {(newStaff.data?.length ?? 0) > 0 && (
                <ul aria-label="New staff">
                  {newStaff.data!.filter((m) => m.userId !== session.userId).map((m) => (
                    <li key={m.userId}>
                      <button type="button" className={row} onClick={() => { setOpen(false); void import("@/api/demoLogins").then((api) => api.acceptStaffInvite(m.userId)).then(() => switchAccount(m.userId, m)); }}>
                        <span className="flex-1">{m.name}<span className="block text-xs text-clay-muted">{ROLE_LABEL[m.role]}, {m.status === "invited" ? "invited: opens the invitation" : "invited in this demo"}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Every other trainer and every sample member, so any account can be reached in a demo. */}
              <details className="group">
                <summary className={`${row} cursor-pointer list-none text-xs font-semibold text-clay-subtle`}>More accounts</summary>
                <ul aria-label="More accounts" className="max-h-60 overflow-y-auto">
                  {DEMO_ACCOUNTS.filter((a) => (a.role === "trainer" || a.role === "member") && !a.featured && !a.otherGym && a.userId !== session.userId).map((a) => (
                    <li key={a.userId}>
                      <button type="button" className={row} onClick={() => { setOpen(false); switchAccount(a.userId); }}>
                        <span className="flex-1">
                          {a.name}
                          <span className="block text-xs text-clay-muted">{ROLE_LABEL[a.role]}{a.blurb ? `, ${a.blurb.replace(/^Trainer, /, "")}` : ""}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
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
  );
}
