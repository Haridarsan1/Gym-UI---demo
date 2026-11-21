/**
 * The writing rules (CLAUDE.md) that can be checked by machine. Used by `copy.test.ts` (every sentence in the source) and `e2e/copy.spec.ts` (everything on each screen).
 * Each rule says what is wrong with a piece of text; an empty result means it is fine.
 */
export const RULES: Array<[string, (text: string) => boolean]> = [
  ["exclamation mark", (t) => /[A-Za-z0-9)”’."]!(\s|$)/.test(t)],
  ["straight apostrophe (use ’)", (t) => /[A-Za-z]'[a-z]/.test(t)],
  ["milestone name", (t) => /\bM[0-9]B?\b/.test(t) || /\bM1\.5\b/.test(t) || /\bmilestone\b/i.test(t)],
  ["requirement ID", (t) => /\b[A-Z]\d{2}\b/.test(t)],
  ["record id", (t) => /\b(mem|br|pl|inv|usr|si|sp|ae|pay|bk|tpl|ex|rm|tn|u|t|cn|rf)_[a-z0-9]+(_[a-z0-9]+)*\b/.test(t)],
  ["internal word", (t) => /\b(seed|seeded|stub|stubs|lorem|TODO|FIXME|placeholder text|undefined|NaN|\[object Object\])\b/i.test(t)],
];
