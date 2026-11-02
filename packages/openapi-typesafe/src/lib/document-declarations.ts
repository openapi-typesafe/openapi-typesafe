import type ts from "typescript";
import { parseStatements } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import { loadTypeScript } from "../adapters/type-ast-bridge/load-typescript.js";
import { printWithTypeScript } from "../adapters/type-ast-bridge/print-typescript.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";
import { type FooterEntry, isIrDeclaration } from "./footer-entry.js";

/** The document in three parts; the footer may hold TypeScript nodes from user code. */
export interface TransformedDocument {
  readonly body: readonly IrDeclaration[];
  readonly footer: readonly FooterEntry[];
  readonly closing: readonly IrDeclaration[];
}

/** The TypeScript printer ends the file with a line break; a raw declaration holds the text without it. */
function withoutFinalLineBreak(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

/** A TypeScript node from user code, as the TypeScript printer prints it. */
function printedNode(node: ts.Node): IrDeclaration {
  return { kind: "rawDeclaration", text: withoutFinalLineBreak(printWithTypeScript(loadTypeScript(), [node])) };
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
  const ts = loadTypeScript();
  const text = withoutFinalLineBreak(printWithTypeScript(ts, parseStatements(ts, declaration.text)));
  return text === "" ? null : { ...declaration, text };
}

function entryDeclaration(entry: FooterEntry): IrDeclaration | null {
  return isIrDeclaration(entry) ? reprinted(entry) : printedNode(entry);
}

/** The document as IR declarations in output order; footer TypeScript nodes become raw text. */
export function documentDeclarations({ body, footer, closing }: TransformedDocument): IrDeclaration[] {
  return [
    ...body.flatMap((declaration) => reprinted(declaration) ?? []),
    ...footer.flatMap((entry) => entryDeclaration(entry) ?? []),
    ...closing,
  ];
}
