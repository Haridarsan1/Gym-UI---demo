import { cn } from "@/lib/format";

const TONES = ["bg-lilac-100 text-lilac-700", "bg-mint-100 text-mint-700", "bg-ember-100 text-ember-700", "bg-clay-lavender text-clay-ink"];

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const tone = TONES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length]!;
  return (
    <span aria-hidden="true" className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold", tone, className)}>
      {initialsOf(name)}
    </span>
  );
}
