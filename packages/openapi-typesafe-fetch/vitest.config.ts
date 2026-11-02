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
    coverage: createCoverageOptions({ statements: 91, branches: 89, functions: 85, lines: 91 }),
  },
});
