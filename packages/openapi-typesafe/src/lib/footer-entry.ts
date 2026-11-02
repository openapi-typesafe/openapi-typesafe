import type ts from "typescript";
import { isTypeAliasNamed } from "../adapters/type-ast-bridge/footer-nodes.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";

/** A footer entry: a declaration in IR, or a TypeScript node added by user code. */
export type FooterEntry = IrDeclaration | ts.Node;

/** IR nodes have a string `kind`; TypeScript nodes have a numeric `SyntaxKind`. */
export function isIrDeclaration(entry: FooterEntry): entry is IrDeclaration {
  return typeof entry.kind === "string";
}

/**
 * Whether the entry declares a type alias with this name: an IR type alias, a named raw
 * declaration (the helper types), or a user's TypeScript type alias. Helpers are added once.
 */
export function declaresTypeAlias(entry: FooterEntry, name: string): boolean {
  if (!isIrDeclaration(entry)) {
    return isTypeAliasNamed(entry, name);
  }
  return (entry.kind === "typeAlias" || entry.kind === "rawDeclaration") && entry.name === name;
}
