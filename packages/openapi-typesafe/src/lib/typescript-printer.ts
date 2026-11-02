import ts from "typescript";

export interface AstToStringOptions {
  fileName?: string;
  sourceText?: string;
  formatOptions?: ts.PrinterOptions;
}

/** Print TypeScript nodes as the original `astToString` did. */
export function printWithTypeScript(nodes: readonly ts.Node[], options?: AstToStringOptions): string {
  const sourceFile = ts.createSourceFile(
    options?.fileName ?? "openapi-ts.ts",
    options?.sourceText ?? "",
    ts.ScriptTarget.ESNext,
    false,
    ts.ScriptKind.TS,
  );
  // @ts-expect-error it’s OK to overwrite statements once
  sourceFile.statements = ts.factory.createNodeArray(nodes);
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
    ...options?.formatOptions,
  });
  return printer.printFile(sourceFile);
}
