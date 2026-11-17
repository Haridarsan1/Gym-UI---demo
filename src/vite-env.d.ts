/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by the Playwright config so development-only overlays stay out of the way of tests. */
  readonly VITE_E2E?: string;
}
