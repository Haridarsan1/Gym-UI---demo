import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/format";

type Variant = "primary" | "clay" | "ink" | "night" | "text";
type Size = "md" | "lg";

const base =
  "press relative inline-flex items-center justify-center gap-2 rounded-full font-semibold disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<Variant, string> = {
  /* Ember clay: the free-trial call to action. */
  primary: "clay-ember",
  /* White clay: secondary actions on light sections. */
  clay: "clay-flat !rounded-full text-clay-ink",
  /* Dark clay: strong secondary on light sections. */
  ink: "clay-night",
  /* Glass: secondary actions on dark surfaces. */
  night: "night-glass text-white hover:bg-white/10",
  text: "!rounded-md text-current underline decoration-ember-500/70 decoration-2 underline-offset-4 hover:decoration-ember-500",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[0.9375rem]",
  lg: "h-14 px-7 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

function classes(variant: Variant, size: Size, className?: string) {
  return cn(base, variants[variant], variant !== "text" && sizes[size], className);
}

export function Button({ variant = "clay", size = "md", className, children, ...rest }: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={classes(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant = "clay", size = "md", className, children }: CommonProps & { to: string }) {
  const cls = classes(variant, size, className);
  if (to.startsWith("#") || to.startsWith("mailto:")) {
    return (
      <a href={to} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={cls}>
      {children}
    </Link>
  );
}
