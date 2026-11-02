import { toStatements } from "../adapters/type-ast-bridge/ir-declarations-to-typescript.js";
import { toTypeElement, toTypeNode } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import {
  loadTypeScript,
  type TypeScriptModule,
} from "../adapters/type-ast-bridge/load-typescript.js";
import {
  type AstToStringOptions,
  printWithTypeScript,
} from "../adapters/type-ast-bridge/print-typescript.js";
import type { ts } from "../adapters/type-ast-bridge/typescript-types.js";
import { type IrPrintable, printFragments } from "../application/print/print-nodes.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";

export type { AstToStringOptions } from "../adapters/type-ast-bridge/print-typescript.js";

/** What `astToString` prints: IR (from `openapiTS` and the transformers) or TypeScript nodes. */
export type AstToStringInput = IrPrintable | ts.Node | readonly (IrPrintable | ts.Node)[];

function isIrNode(node: IrPrintable | ts.Node): node is IrPrintable {
  return typeof node.kind === "string";
}

/** An IR node in TypeScript form, for printing it together with TypeScript nodes. */
function toTypeScriptNodes(ts: TypeScriptModule, node: IrPrintable): ts.Node[] {
  if (isIrDeclarationKind(node)) {
    return toStatements(ts, node);
  }
  const isMember = node.kind === "property" || node.kind === "indexSignature";
  return [isMember ? toTypeElement(ts, node) : toTypeNode(ts, node)];
}

function isIrDeclarationKind(node: IrPrintable): node is IrDeclaration {
  return ["interface", "typeAlias", "enum", "constArray", "rawDeclaration"].includes(node.kind);
}

/**
 * Print declarations, members or types as a TypeScript file body. IR is printed by our printer;
 * with TypeScript nodes in the input, or with TypeScript printer options, everything goes
 * through the TypeScript printer as before (ADR-004, decision 1).
 */
export function astToString(ast: AstToStringInput, options?: AstToStringOptions): string {
  const nodes: readonly (IrPrintable | ts.Node)[] = Array.isArray(ast)
    ? ast
    : [ast as IrPrintable | ts.Node];
  if (nodes.every(isIrNode) && !options) {
    return printFragments(nodes);
  }
  const ts = loadTypeScript();
  const statements = nodes.flatMap((node) =>
    isIrNode(node) ? toTypeScriptNodes(ts, node) : [node],
  );
  return printWithTypeScript(ts, statements, options);
}
