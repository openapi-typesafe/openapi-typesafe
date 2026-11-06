import type ts from "typescript";
import type { TypeScriptModule } from "./load-typescript.js";
import type { ts as CompilerTypes } from "./typescript-types.js";

/** Options of `astToString` for the TypeScript printer, as in the original. */
export interface AstToStringOptions {
  fileName?: string;
  sourceText?: string;
  /** The installed compiler's printer options (ADR-031: named without `ts.PrinterOptions`). */
  formatOptions?: CompilerTypes.PrinterOptions;
}

/** Print TypeScript nodes as the original `astToString` did. */
export function printWithTypeScript(
  ts: TypeScriptModule,
  nodes: readonly ts.Node[],
  options?: AstToStringOptions,
): string {
  const sourceFile = ts.createSourceFile(
    options?.fileName ?? "openapi-ts.ts",
    options?.sourceText ?? "",
    ts.ScriptTarget.ESNext,
    false,
    ts.ScriptKind.TS,
  );
  // The source file is new and not shared, so its statements can be set once.
  (sourceFile as { statements: ts.NodeArray<ts.Statement> }).statements =
    ts.factory.createNodeArray(nodes as readonly ts.Statement[]);
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
    ...options?.formatOptions,
  });
  return printer.printFile(sourceFile);
}
