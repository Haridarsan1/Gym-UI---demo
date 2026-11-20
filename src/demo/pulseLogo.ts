/**
 * Pulse Fitness’s logo for the demo gym: an original mark drawn for this demo. A deep teal tile with a pulse line in mint that rises into a peak and ends in a coral dot. Its colours are its own and
 * are not Ember’s orange. It is stored the way an uploaded logo is (a data URL on the gym), so white-labelling is visible without anyone uploading anything.
 */
export const PULSE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Pulse Fitness"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0E5560"/><stop offset="1" stop-color="#0A2F4A"/></linearGradient></defs><rect width="128" height="128" rx="28" fill="url(#g)"/><path d="M14 70h22l12-26 18 52 14-36h14" fill="none" stroke="#8CF0CF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="108" cy="60" r="9" fill="#FF8A6B"/></svg>`;

const base64 = (text: string): string => (typeof btoa === "function" ? btoa(text) : Buffer.from(text).toString("base64"));
export const PULSE_LOGO_URL = `data:image/svg+xml;base64,${base64(PULSE_LOGO_SVG)}`;
