import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";

import viteConfig from "./vite.config.js";

/**
 * Unit tests run against the same aliases and Svelte plugin as the webview build. The extra
 * `browser` resolve condition is what lets a test mount a component with
 * `@testing-library/svelte`; without it `svelte` resolves to its server build, whose `mount`
 * throws. SSR-only tests (`render` from `svelte/server`) are unaffected.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: { conditions: ["browser"] },
    test: {
      include: ["test/unit/**/*.test.ts"],
    },
  }),
);
