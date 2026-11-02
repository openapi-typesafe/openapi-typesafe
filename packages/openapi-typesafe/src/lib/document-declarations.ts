import type ts from "typescript";
import type { IrDeclaration } from "../domain/ir/nodes.js";
import { transformDocument } from "../transform/index.js";
import type { GlobalContext, OpenAPI3 } from "../types.js";
import type { LegacyFooterSink } from "./footer-sink.js";
import { stringToAST } from "./ts.js";
import { printWithTypeScript } from "./typescript-printer.js";

/** The TypeScript printer ends the file with a line break; a raw declaration holds the text without it. */
function withoutFinalLineBreak(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

/** A node the generator did not build (from a user callback), as the TypeScript printer prints it. */
function printedNode(node: ts.Node): IrDeclaration {
  return { kind: "rawDeclaration", text: withoutFinalLineBreak(printWithTypeScript([node])) };
}

/**
 * Raw declaration text (helper types, the `inject` option) as the TypeScript printer reprints it,
 * as the original output did. Null when the text holds no statement. Temporary: task 6.6 removes
 * the TypeScript dependency and prints the text as written.
 */
function reprinted(declaration: IrDeclaration): IrDeclaration | null {
  if (declaration.kind !== "rawDeclaration") {
    return declaration;
  }
  const text = withoutFinalLineBreak(printWithTypeScript(stringToAST(declaration.text) as ts.Node[]));
  return text === "" ? null : { kind: "rawDeclaration", text };
}

/** Footer nodes in IR: the generator's own nodes from the sink, other nodes as printed text. */
function footerDeclarations(footer: readonly ts.Node[], sink: LegacyFooterSink | undefined): IrDeclaration[] {
  return footer.flatMap((node) => {
    const declaration = sink?.declarationOf(node);
    return declaration ? (reprinted(declaration) ?? []) : [printedNode(node)];
  });
}

/** One run's document as IR declarations, in output order (ENGINEERING_PLAN 6.1). */
export function documentDeclarations(schema: OpenAPI3, ctx: GlobalContext): IrDeclaration[] {
  const { body, footer, closing } = transformDocument(schema, ctx);
  return [
    ...body.flatMap((declaration) => reprinted(declaration) ?? []),
    ...footerDeclarations(footer, ctx.runFooter?.sink),
    ...closing,
  ];
}
