import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { haptic } from "@/design/haptics";
import { cn } from "@/lib/format";

export type Button3DVariant = "ember" | "mint" | "lilac" | "ink" | "white";

interface Common {
  variant?: Button3DVariant;
  size?: "md" | "lg";
  /** Buzz briefly when pressed (Android). Use for logging a set, a check-in or finishing a workout. */
  haptic?: boolean;
  className?: string;
  children: ReactNode;
}

/** Primary action in the member and trainer apps. Not used where money or access is handled. */
export function Button3D({ variant = "ember", size = "md", haptic: buzz, className, children, onClick, type = "button", ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      data-variant={variant}
      data-size={size}
      className={cn("btn3d", className)}
      onClick={(e) => {
        if (buzz) haptic();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Button3DLink({ variant = "ember", size = "md", haptic: buzz, className, children, onClick, ...rest }: Common & LinkProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <Link
      data-variant={variant}
      data-size={size}
      className={cn("btn3d", className)}
      onClick={(e) => {
        if (buzz) haptic();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
