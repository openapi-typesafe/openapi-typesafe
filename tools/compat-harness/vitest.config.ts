import { defineConfig } from "vitest/config";
import { createCoverageOptions, LAYER_GLOBS } from "../../vitest.coverage.ts";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      ...createCoverageOptions(
        { statements: 99, branches: 95, functions: 100, lines: 99 },
        LAYER_GLOBS,
      ),
      exclude: ["src/cli/**"],
    },
  },
});
