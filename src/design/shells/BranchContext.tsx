import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Which branch the staff member is looking at. "all" means every branch they may see. The choice is remembered per person.
 * The list of branches can arrive after the first render, so a saved choice that is not in the list is ignored rather than
 * the whole shell being rebuilt.
 */
const Ctx = createContext<{ branchId: string; setBranchId: (id: string) => void } | null>(null);

const readSaved = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function BranchProvider({ userId, branchIds, children }: { userId: string; branchIds: string[]; children: ReactNode }) {
  const key = `ember.branch.${userId}`;
  const [chosen, setChosen] = useState<string | null>(() => readSaved(key));
  const setBranchId = useCallback(
    (id: string) => {
      setChosen(id);
      try {
        localStorage.setItem(key, id);
      } catch {
        /* Not remembered. */
      }
    },
    [key],
  );

  const valid = chosen !== null && (chosen === "all" || branchIds.includes(chosen));
  const branchId = valid ? chosen : branchIds.length === 1 ? (branchIds[0] ?? "all") : "all";
  const value = useMemo(() => ({ branchId, setBranchId }), [branchId, setBranchId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBranch() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBranch must be used inside BranchProvider.");
  return v;
}
