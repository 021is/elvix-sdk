import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Component tests opt into a DOM per file with `// @vitest-environment jsdom`.
    environment: "node",
    // The page a component test runs on: cross-origin to the fake elvix
    // (tests/helpers/fake-elvix.ts, https://elvix.test), as a customer host
    // is, but same-site, so a session without a token is one a browser can
    // really hold (elvix's cookie is SameSite=Lax; tests/cookie-reach.test.tsx).
    environmentOptions: { jsdom: { url: "https://app.elvix.test/" } },
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
