import { defineConfig } from "vitest/config";

// Lets `npx vitest` at the repository root run every package's tests in one process.
// CI and `pnpm test` still run each package's own `test` script through turbo.
export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
});
