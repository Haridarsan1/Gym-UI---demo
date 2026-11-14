/**
 * Product identity. Change the name here and it updates across the site.
 * Gym tenants upload their own logo inside the app (logo-only white-label);
 * Ember colours and typography stay fixed for every tenant.
 */
export const brand = {
  name: "Ember",
  domain: "ember.fit",
  supportEmail: "hello@ember.fit",
  trialDays: 14,
  year: 2026,
} as const;
