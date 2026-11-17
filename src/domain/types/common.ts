import { z } from "zod";

/** Building blocks shared by every record. Dates are ISO strings; money is whole paise (₹1 = 100 paise). */
export const id = z.string().min(1);
export const isoDateTime = z.iso.datetime({ offset: true });
export const isoDate = z.iso.date();
export const paise = z.number().int().nonnegative();
/** Tax rate in basis points: 1800 = 18% GST. */
export const basisPoints = z.number().int().min(0).max(10000);
export const email = z.email();
/** 10-digit Indian mobile number, no country code. */
export const mobile = z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.");
/** Repeating a request with the same key must not create a second record (payments, workouts, imports, gateway events). */
export const idempotencyKey = z.string().min(8);
