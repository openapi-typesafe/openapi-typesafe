import { defineConfig } from "vitest/config";
import { createCoverageOptions } from "../../vitest.coverage.js";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    typecheck: {
      enabled: true,
      tsconfig: "./tsconfig.json",
    },
    restoreMocks: true,
    coverage: createCoverageOptions({ statements: 100, branches: 97, functions: 100, lines: 100 }),
  },
});
