import type ts from "typescript";
import { irRaw } from "../../domain/ir/constructors.js";
import type { IrType } from "../../domain/ir/nodes.js";
import { toTypeNode } from "./ir-to-typescript.js";
import type { TypeScriptModule } from "./load-typescript.js";

/**
 * Callback nodes that the IR cannot model exactly are kept as text, printed the way the original
 * printed them (ADR-004, decision 3).
 */

/** IR nodes have a string `kind`; TypeScript nodes have a numeric one. */
export function isIrNode(value: unknown): value is IrType {
  return typeof (value as { kind?: unknown }).kind === "string";
}

/** Replace IR nodes nested in a TypeScript tree, so the TypeScript printer can print it. */
function withoutIrNodes<T extends ts.Node>(ts: TypeScriptModule, node: T): T {
  const visit = (child: ts.Node): ts.Node =>
    isIrNode(child) ? toTypeNode(ts, child) : ts.visitEachChild(child, visit, undefined);
  return visit(node) as T;
}

function printPlainNode(ts: TypeScriptModule, node: ts.Node): string {
  const source = ts.createSourceFile("openapi-ts.ts", "", ts.ScriptTarget.ESNext, false);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printNode(ts.EmitHint.Unspecified, node, source);
}

/** Print as the original did: the TypeScript printer with an empty source file and LF. */
export function printTypeScriptNode(ts: TypeScriptModule, node: ts.Node): string {
  return printPlainNode(ts, withoutIrNodes(ts, node));
}

/** The node as text, keeping the node itself for the way back to TypeScript (`toTypeNode`). */
export function asRaw(ts: TypeScriptModule, node: ts.TypeNode): IrType {
  const printable = withoutIrNodes(ts, node);
  return irRaw(printPlainNode(ts, printable), printable);
}

function hasSyntheticComments(ts: TypeScriptModule, node: ts.Node): boolean {
  const leading = ts.getSyntheticLeadingComments(node)?.length ?? 0;
  return leading + (ts.getSyntheticTrailingComments(node)?.length ?? 0) > 0;
}

/** Parsed nodes print from their source text, and comments attach to text: keep both printed. */
export function needsPrintedText(ts: TypeScriptModule, node: ts.Node): boolean {
  return node.pos >= 0 || hasSyntheticComments(ts, node);
}
