import type { IrDeclaration } from "../../domain/ir/nodes.js";
import { writeDeclaration } from "./declaration-printer.js";
import { DEFAULT_PRINT_OPTIONS, type PrintOptions } from "./print-options.js";
import { TextWriter } from "./text-writer.js";

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
