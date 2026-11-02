import { defineConfig } from "vitest/config";
import { createCoverageOptions, LAYER_GLOBS } from "../../vitest.coverage.ts";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      ...createCoverageOptions(
        { statements: 100, branches: 100, functions: 100, lines: 100 },
        LAYER_GLOBS,
      ),
      // The composition root only wires the process; CI runs it for real (CODING_PRINCIPLES 10.7).
      exclude: ["src/cli/main.ts"],
    },
  },
});
