import { STATE_NAMES } from "@/domain/billing";

/** The gym’s profile (R02): name, registered name and address, GSTIN and logo. Pure checks, in words. */
export const GSTIN = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const LOGO_MAX_CHARS = 400_000;
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export interface ProfileDraft { name: string; legalName: string; gstin: string; address: string }
export type ProfileErrors = Partial<Record<keyof ProfileDraft | "logo", string>>;

export function validateProfile(d: ProfileDraft, logo?: string | null): ProfileErrors {
  const e: ProfileErrors = {};
  const name = d.name.trim();
  if (name.length < 2) e.name = "Enter the gym’s name. It is shown in the app and to your members.";
  else if (name.length > 60) e.name = "Use 60 characters or fewer.";
  if (d.legalName.trim().length > 120) e.legalName = "Use 120 characters or fewer.";
  const g = d.gstin.trim().toUpperCase();
  if (g) {
    const m = GSTIN.exec(g);
    if (!m) e.gstin = "A GSTIN is 15 characters, like 27AABCP1234F1Z5. Check it, or leave it empty.";
    else if (!STATE_NAMES[m[1]!]) e.gstin = `The first two digits (${m[1]}) aren’t a state code. Check the GSTIN.`;
  }
  if (d.address.trim().length > 250) e.address = "Use 250 characters or fewer.";
  if (logo) {
    if (!LOGO.test(logo)) e.logo = "Use a PNG, JPG, WebP or SVG image.";
    else if (logo.length > LOGO_MAX_CHARS) e.logo = "That image is too large. Use one under about 300 KB.";
  }
  return e;
}

/** The state a GSTIN says the gym is registered in, in words. */
export const gstinState = (gstin: string): string | undefined => { const m = GSTIN.exec(gstin.trim().toUpperCase()); return m ? STATE_NAMES[m[1]!] : undefined; };
