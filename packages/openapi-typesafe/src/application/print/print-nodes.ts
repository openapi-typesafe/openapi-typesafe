import type { IrDeclaration, IrMember, IrType } from "../../domain/ir/nodes.js";
import { writeDeclaration } from "./declaration-printer.js";
import { DEFAULT_PRINT_OPTIONS, type PrintOptions } from "./print-options.js";
import { TextWriter } from "./text-writer.js";
import { writeMember, writeType } from "./type-printer.js";

/**
 * Print declarations as a TypeScript file body: one declaration per line, a line break at the end,
 * and nothing for an empty list. Pure and deterministic (ENGINEERING_PLAN §4.3).
 */
export function printNodes(
  declarations: readonly IrDeclaration[],
  options: PrintOptions = DEFAULT_PRINT_OPTIONS,
): string {
  const writer = new TextWriter(options);
  for (const declaration of declarations) {
    writeDeclaration(writer, declaration);
  }
  writer.writeLine();
  return writer.text;
}

/** Anything the IR printer can print at the top level of a file. */
export type IrPrintable = IrDeclaration | IrMember | IrType;

const DECLARATION_KINDS: ReadonlySet<string> = new Set<IrDeclaration["kind"]>([
  "interface",
  "typeAlias",
  "enum",
  "constArray",
  "rawDeclaration",
]);
const MEMBER_KINDS: ReadonlySet<string> = new Set<IrMember["kind"]>(["property", "indexSignature"]);

function writePrintable(writer: TextWriter, node: IrPrintable): void {
  if (DECLARATION_KINDS.has(node.kind)) {
    writeDeclaration(writer, node as IrDeclaration);
    return;
  }
  writer.writeLine();
  if (MEMBER_KINDS.has(node.kind)) {
    writeMember(writer, node as IrMember);
  } else {
    writeType(writer, node as IrType);
  }
}

/**
 * Print declarations, members or types, one per line, as the TypeScript printer prints such nodes
 * placed in a file (the original `astToString` accepted any node).
 */
export function printFragments(
  nodes: readonly IrPrintable[],
  options: PrintOptions = DEFAULT_PRINT_OPTIONS,
): string {
  const writer = new TextWriter(options);
  for (const node of nodes) {
    writePrintable(writer, node);
  }
  writer.writeLine();
  return writer.text;
}
