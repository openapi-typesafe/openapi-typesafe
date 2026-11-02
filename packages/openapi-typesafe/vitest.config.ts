import { defineConfig } from "vitest/config";
import { createCoverageOptions } from "../../vitest.coverage.js";

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    globals: true,
    coverage: {
      ...createCoverageOptions({ statements: 91, branches: 88, functions: 95, lines: 91 }),
      // The CLI's composition root only wires the process; the built CLI is tested end to end
      // (CODING_PRINCIPLES 10.7).
      exclude: ["src/cli/main.ts"],
    },
  },
});
