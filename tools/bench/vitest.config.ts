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
      // The composition root only wires the process; the benchmark runs it for real
      // (CODING_PRINCIPLES 10.7). The memory probe runs inside the generator processes, where
      // coverage does not reach; the runner's tests check the number it writes.
      exclude: ["src/cli/main.ts", "src/adapters/peak-rss-probe.cjs"],
    },
  },
});
