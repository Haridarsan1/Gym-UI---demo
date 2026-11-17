/** The time the API uses. Tests can set it to get the same answer every day. */
let override: Date | null = null;

export const now = (): Date => override ?? new Date();

/** Pass null to go back to the real clock. */
export function setNow(date: Date | null): void {
  override = date;
}
