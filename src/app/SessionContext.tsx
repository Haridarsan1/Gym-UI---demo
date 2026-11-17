import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { can as canDo, type Action, type Principal, type Resource } from "@/domain/permissions";
import { readSession, SESSION_KEY, writeSession, type Session } from "@/app/session";

interface SessionApi {
  session: Session | null;
  signIn: (session: Session) => void;
  signOut: () => void;
}

const Ctx = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());

  // Keep several open tabs in step: signing out in one signs out in all.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY || e.key === null) setSession(readSession());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback((s: Session) => {
    writeSession(s);
    setSession(s);
  }, []);
  const signOut = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider.");
  return v;
}

/** Returns a checker bound to the signed-in person. */
export function useCan(): (action: Action, resource?: Resource) => boolean {
  const { session } = useSession();
  const principal: Principal | null = session;
  return useCallback((action, resource) => canDo(principal, action, resource), [principal]);
}
