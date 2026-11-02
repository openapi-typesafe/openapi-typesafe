import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";
import type ts from "typescript";
import { printNodes } from "./application/print/print-nodes.js";
import type { IrDeclaration } from "./domain/ir/nodes.js";
import { createDocumentRun } from "./lib/document-run.js";
import type { LegacyFooterSink } from "./lib/footer-sink.js";
import { astToString, stringToAST } from "./lib/ts.js";
import { debug } from "./lib/utils.js";
import { transformDocument } from "./transform/index.js";
import type { GlobalContext, OpenAPI3, OpenAPITSOptions } from "./types.js";

/** `astToString` ends the file with a line break; a raw declaration holds the text without it. */
function withoutFinalLineBreak(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

/** A node the generator did not build (from a user callback), as the TypeScript printer prints it. */
function printedNode(node: ts.Node): IrDeclaration {
  return { kind: "rawDeclaration", text: withoutFinalLineBreak(astToString(node)) };
}

/**
 * Raw declaration text (helper types, the `inject` option) as the TypeScript printer reprints it,
 * as the original output did. Null when the text holds no statement. Temporary: Phase 6 removes
 * the TypeScript dependency and prints the text as written (ADR-010).
 */
function reprinted(declaration: IrDeclaration): IrDeclaration | null {
  if (declaration.kind !== "rawDeclaration") {
    return declaration;
  }
  const text = withoutFinalLineBreak(astToString(stringToAST(declaration.text) as ts.Node[]));
  return text === "" ? null : { kind: "rawDeclaration", text };
}

/** Footer nodes in IR: the generator's own nodes from the sink, other nodes as printed text. */
function footerDeclarations(footer: readonly ts.Node[], sink: LegacyFooterSink | undefined): IrDeclaration[] {
  return footer.flatMap((node) => {
    const declaration = sink?.declarationOf(node);
    return declaration ? (reprinted(declaration) ?? []) : [printedNode(node)];
  });
}

/** @internal One run's document printed by our printer; `generateTypes` without the loading. */
export function printDocument(schema: OpenAPI3, ctx: GlobalContext): string {
  const { body, footer, closing } = transformDocument(schema, ctx);
  return printNodes([
    ...body.flatMap((declaration) => reprinted(declaration) ?? []),
    ...footerDeclarations(footer, ctx.runFooter?.sink),
    ...closing,
  ]);
}

/**
 * @internal The generated file body printed by our printer (ENGINEERING_PLAN Phase 5, step 7).
 * Used by the CLI; the Node API keeps returning `ts.Node`s until Phase 6 (ADR-010).
 */
export async function generateTypes(
  source: string | URL | OpenAPI3 | Buffer | Readable,
  options: OpenAPITSOptions = {} as Partial<OpenAPITSOptions>,
): Promise<string> {
  const { schema, ctx } = await createDocumentRun(source, options);
  const startedAt = performance.now();
  const text = printDocument(schema, ctx);
  debug("Completed AST transformation for entire document", "ts", performance.now() - startedAt);
  return text;
}
