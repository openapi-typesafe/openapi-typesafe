import { defineConfig } from "vitest/config";
import { createCoverageOptions, LAYER_GLOBS } from "../../vitest.coverage.ts";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      ...createCoverageOptions(
        { statements: 99, branches: 98, functions: 98, lines: 100 },
        LAYER_GLOBS,
      ),
      // The composition root only wires the process; `validate` runs it for real (CODING_PRINCIPLES 10.7).
      exclude: ["src/cli/main.ts"],
    },
  },
});
