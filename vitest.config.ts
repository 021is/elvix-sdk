import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Component tests opt into a DOM per file with `// @vitest-environment jsdom`.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
