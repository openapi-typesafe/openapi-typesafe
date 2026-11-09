// @vitest-environment node
// The test reads files; jsdom gives `import.meta.url` an http scheme.
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * With TanStack Query's `Register { defaultError: unknown }` the error of a hook is `unknown`, and
 * `isResponseError` and `instanceof Error` still narrow it (the react-query docs, "Errors"). The
 * consumer registers the type for its whole program, so it is compiled apart from the other tests.
 */
const CONSUMER = fileURLToPath(new URL("./registered-error/consumer.ts", import.meta.url));
/** A whole TypeScript program with React and TanStack Query types; see portable-declarations. */
const TYPE_PROGRAM_TIMEOUT_MS = 60_000;

/** The diagnostics of the consumer, as `file(line): message`. */
function diagnosticsOf(file: string): string[] {
  const program = ts.createProgram([file], {
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  });
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const line = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line;
    return `${diagnostic.file?.fileName ?? ""}(${line ?? 0}): ${message}`;
  });
}

describe("a registered defaultError of unknown", () => {
  it("types the hook error unknown, and the guards still narrow it", {
    timeout: TYPE_PROGRAM_TIMEOUT_MS,
  }, () => {
    const diagnostics = diagnosticsOf(CONSUMER);

    expect(diagnostics).toEqual([]);
  });
});
