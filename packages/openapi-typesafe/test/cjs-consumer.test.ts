import { fileURLToPath } from "node:url";
import { execa } from "execa";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A CommonJS consumer of the built package: TypeScript with `"module": "node16"` found no
 * declarations for `require` (upstream #2047, #2155), and `require()` failed on the ESM-only
 * dependencies (upstream #2342). Both run against `dist`, as a consumer sees it.
 */

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONSUMER = fileURLToPath(new URL("fixtures/cjs-consumer/consumer.cts", import.meta.url));
const TIMEOUT_MS = 20_000;

const REQUIRE_SCRIPT = [
  'const api = require("openapi-typesafe");',
  'if (typeof api.default !== "function" || typeof api.astToString !== "function") {',
  "  process.exit(1);",
  "}",
].join("\n");

describe("CommonJS consumer", () => {
  it(
    "require of the package loads the API with an empty stderr",
    async () => {
      const result = await execa("node", ["-e", REQUIRE_SCRIPT], { cwd: PACKAGE_ROOT });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
    },
    TIMEOUT_MS,
  );

  it("TypeScript with module node16 finds the declarations for require", () => {
    const options: ts.CompilerOptions = {
      module: ts.ModuleKind.Node16,
      moduleResolution: ts.ModuleResolutionKind.Node16,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    };
    const program = ts.createProgram([CONSUMER], options);

    const errors = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));

    expect(errors).toEqual([]);
  });
});
