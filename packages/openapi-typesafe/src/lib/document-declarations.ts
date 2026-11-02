import { loadTypeScript } from "../adapters/type-ast-bridge/load-typescript.js";
import { printWithTypeScript } from "../adapters/type-ast-bridge/print-typescript.js";
import type { ts } from "../adapters/type-ast-bridge/typescript-types.js";
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

function entryDeclaration(entry: FooterEntry): IrDeclaration {
  return isIrDeclaration(entry) ? entry : printedNode(entry);
}

/**
 * The document as IR declarations in output order. Footer TypeScript nodes from user code become
 * raw text through the bridge; raw text is printed as written (ADR-010, decision 4).
 */
export function documentDeclarations({ body, footer, closing }: TransformedDocument): IrDeclaration[] {
  return [...body, ...footer.map(entryDeclaration), ...closing];
}
