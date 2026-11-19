import { useEffect, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, LogOut, RotateCcw, Search, Shuffle, type LucideIcon } from "lucide-react";
import { paletteScreens, screenPath } from "@/app/navigation";
import { useCan, useSession } from "@/app/SessionContext";
import { useResetDemo, useSignOut, useSwitchAccount } from "@/app/useSessionActions";
import { FEATURED_ACCOUNTS } from "@/app/demoSignIn";
import { DEMO_MODE } from "@/app/mode";
import { Dialog } from "@/design/Dialog";
import { ROLE_LABEL, areaFor } from "@/domain/roles";
import { cn } from "@/lib/format";

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  run: () => void;
}

/** ⌘K (Ctrl+K on Windows): jump to any screen you may open, or run an action. Only lists what the person is allowed to do. */
export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { session } = useSession();
  const can = useCan();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const resetDemo = useResetDemo();
  const switchAccount = useSwitchAccount();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    if (!session) return [];
    const area = areaFor(session.role);
    const go: Command[] = paletteScreens(area, can).map((s) => ({
      id: `go-${s.id}`, label: s.title, hint: "Go to", icon: s.icon, run: () => navigate(screenPath(area, s)),
    }));
    const switches: Command[] = DEMO_MODE
      ? FEATURED_ACCOUNTS.filter((a) => a.userId !== session.userId).map((a) => ({
          id: `switch-${a.userId}`, label: `Switch to ${ROLE_LABEL[a.role]}`, hint: a.name, icon: Shuffle, run: () => switchAccount(a.userId),
        }))
      : [];
    return [
      ...go,
      ...switches,
      { id: "reset", label: "Reset demo data", hint: "Action", icon: RotateCcw, run: () => void resetDemo() },
      { id: "signout", label: "Sign out", hint: "Action", icon: LogOut, run: signOut },
    ];
  }, [session, can, navigate, resetDemo, signOut, switchAccount]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  }, [commands, query]);

  const choose = (c: Command | undefined) => {
    if (!c) return;
    onOpenChange(false);
    c.run();
  };

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} label="Command palette" placement="top" className="!p-0">
      <div className="flex items-center gap-3 border-b border-clay-line px-4">
        <Search className="h-5 w-5 text-clay-muted" aria-hidden="true" />
        <input
          data-autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={shown[active] ? `${listId}-${shown[active]!.id}` : undefined}
          aria-label="Type a screen or action"
          placeholder="Go to a screen or run an action"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(shown[active]);
            }
          }}
          className="h-14 flex-1 bg-transparent text-base placeholder:text-clay-subtle focus:outline-none"
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-auto p-2">
        {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-clay-muted">Nothing matches “{query}”. Try a screen name such as Reports.</li>}
        {shown.map((c, i) => (
          <li key={c.id} id={`${listId}-${c.id}`} role="option" aria-selected={i === active}>
            <button type="button" tabIndex={-1} onMouseEnter={() => setActive(i)} onClick={() => choose(c)} className={cn("flex min-h-[2.75rem] w-full items-center gap-3 rounded-xl px-3 text-left", i === active && "bg-ember-50")}>
              <c.icon className="h-5 w-5 text-clay-muted" aria-hidden="true" />
              <span className="flex-1 font-medium">{c.label}</span>
              <span className="text-xs text-clay-subtle">{c.hint}</span>
              {i === active && <CornerDownLeft className="h-4 w-4 text-clay-subtle" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
