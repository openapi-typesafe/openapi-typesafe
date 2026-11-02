import { defineConfig } from "vitest/config";
import { createCoverageOptions, LAYER_GLOBS } from "../../vitest.coverage.js";

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    globals: true,
    coverage: {
      ...createCoverageOptions({ statements: 98, branches: 96, functions: 99, lines: 98 }, LAYER_GLOBS),
      // The CLI's composition root only wires the process; the built CLI is tested end to end
      // (CODING_PRINCIPLES 10.7).
      exclude: ["src/cli/main.ts"],
    },
  },
});
