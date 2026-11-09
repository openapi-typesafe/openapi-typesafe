// @vitest-environment node
// The test loads the built CommonJS module; jsdom gives `import.meta.url` an http scheme.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * `require()` returns `createClient` itself, as for openapi-react-query (ADR-022), and the named
 * exports are its properties, so `const { isResponseError } = require(…)` works as the ES module's
 * named import does. Rollup's named CommonJS exports alone would return `{ default, … }`. Needs
 * `dist` (`pnpm build`).
 */

const requireBuilt = createRequire(import.meta.url);

/** The module that `require("openapi-typesafe-react-query")` loads. */
function loadCommonJs(): unknown {
  return requireBuilt("../dist/index.cjs");
}

describe("the CommonJS module", () => {
  it("require() returns createClient", () => {
    const createClient = loadCommonJs();

    expect(createClient).toBeTypeOf("function");
    expect((createClient as { name: string }).name).toBe("createClient");
  });

  it("require() has isResponseError as a property", () => {
    const { isResponseError } = loadCommonJs() as { isResponseError: unknown };

    expect(isResponseError).toBeTypeOf("function");
  });
});
