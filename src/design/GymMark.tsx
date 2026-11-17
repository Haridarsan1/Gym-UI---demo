import { cn } from "@/lib/format";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** The gym’s logo, or its initials in a warm tile when it has no logo yet. Never the Ember mark: members see their own gym. */
export function GymMark({ name, logoUrl, className }: { name: string; logoUrl?: string; className?: string }) {
  if (logoUrl) return <img src={logoUrl} alt="" className={cn("h-8 w-8 shrink-0 rounded-lg object-cover", className)} />;
  return (
    <span aria-hidden="true" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-ember-100 to-ember-200 text-[0.8rem] font-extrabold text-ember-800 shadow-[inset_0_-2px_0_rgba(122,39,0,0.15)]", className)}>
      {initials(name)}
    </span>
  );
}
