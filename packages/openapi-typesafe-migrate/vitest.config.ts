import { defineConfig } from "vitest/config";
import { createCoverageOptions, LAYER_GLOBS } from "../../vitest.coverage.js";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      ...createCoverageOptions({ statements: 95, branches: 90, functions: 95, lines: 95 }, LAYER_GLOBS),
      // The composition root only wires the process; the built CLI is tested end to end
      // (CODING_PRINCIPLES 10.7).
      exclude: ["src/cli/main.ts"],
    },
  },
});
