import { defineConfig } from "vitest/config";
import { createCoverageOptions } from "../../vitest.coverage.ts";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The harness is new code: it starts at the project target instead of an inherited baseline.
    coverage: {
      ...createCoverageOptions({ statements: 90, branches: 90, functions: 90, lines: 90 }),
      exclude: ["src/cli/**"],
    },
  },
});
