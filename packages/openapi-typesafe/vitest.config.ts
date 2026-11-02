import { defineConfig } from "vitest/config";
import { createCoverageOptions } from "../../vitest.coverage.js";

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    globals: true,
    coverage: createCoverageOptions({ statements: 91, branches: 88, functions: 95, lines: 91 }),
  },
});
