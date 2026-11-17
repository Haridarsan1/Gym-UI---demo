import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** Which branch the staff member is looking at. "all" means every branch they may see. Remembered per person. */
const Ctx = createContext<{ branchId: string; setBranchId: (id: string) => void } | null>(null);

export function BranchProvider({ userId, branchIds, children }: { userId: string; branchIds: string[]; children: ReactNode }) {
  const key = `ember.branch.${userId}`;
  const [branchId, setState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved && (saved === "all" || branchIds.includes(saved))) return saved;
    } catch {
      /* Not remembered. */
    }
    return branchIds.length === 1 ? (branchIds[0] ?? "all") : "all";
  });
  const setBranchId = useCallback(
    (id: string) => {
      setState(id);
      try {
        localStorage.setItem(key, id);
      } catch {
        /* Not remembered. */
      }
    },
    [key],
  );
  const value = useMemo(() => ({ branchId, setBranchId }), [branchId, setBranchId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBranch() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBranch must be used inside BranchProvider.");
  return v;
}
