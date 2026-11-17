import { Building2 } from "lucide-react";
import { useBranch } from "@/design/shells/BranchContext";
import { cn } from "@/lib/format";

/** Lets staff with more than one branch pick which one to look at. One branch is shown as plain text. */
export function BranchSwitcher({ branches, className }: { branches: Array<{ id: string; name: string }>; className?: string }) {
  const { branchId, setBranchId } = useBranch();
  if (branches.length === 0) return null;
  if (branches.length === 1) {
    return (
      <span className={cn("inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold shadow-sm", className)}>
        <Building2 className="h-4 w-4 text-clay-muted" aria-hidden="true" />
        {branches[0]!.name}
      </span>
    );
  }
  return (
    <label className={cn("relative inline-flex h-11 items-center gap-2 rounded-full bg-white pl-4 pr-3 text-sm font-semibold shadow-sm", className)}>
      <Building2 className="h-4 w-4 text-clay-muted" aria-hidden="true" />
      <span className="sr-only">Branch</span>
      <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-full cursor-pointer appearance-none bg-transparent pr-4 font-semibold focus:outline-none">
        <option value="all">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
