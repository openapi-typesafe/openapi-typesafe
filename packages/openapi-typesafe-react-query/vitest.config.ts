import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";
import { createCoverageOptions } from "../../vitest.coverage.js";

export default defineConfig({
  plugins: [react() as unknown as Plugin],
  test: {
    environment: "jsdom",
    globals: true,
    // Node 25+ exposes its own experimental localStorage and warns when it is not configured.
    // Tests use the jsdom localStorage, so the Node one is turned off.
    execArgv: ["--no-experimental-webstorage"],
    coverage: createCoverageOptions({ statements: 96, branches: 88, functions: 100, lines: 96 }),
  },
});
