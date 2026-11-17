/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set by the Playwright config so development-only overlays stay out of the way of tests. */
  readonly VITE_E2E?: string;
  /** Set to "false" to hide demo-only controls such as the role switcher. */
  readonly VITE_DEMO_MODE?: string;
}
