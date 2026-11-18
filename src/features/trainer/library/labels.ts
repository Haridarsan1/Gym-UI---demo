import type { Exercise } from "@/domain/types";

export const CATEGORY_LABEL: Record<Exercise["category"], string> = { strength: "Strength", cardio: "Cardio", mobility: "Mobility", core: "Core", conditioning: "Conditioning", warmup: "Warm-up" };
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Array<Exercise["category"]>;
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
