import type { IrDeclaration } from "../../../domain/ir/nodes.js";

/**
 * The type names that declarations of the output take. Two declarations of one type name do not
 * compile (TS2300, TS2567), or merge into one type without an error (two enums, two interfaces).
 */

/**
 * A declaration at the start of a line of raw text: the helper types, the `--read-write-markers`
 * types, `inject` text and footer nodes from user code. A `const` lives in the value namespace.
 */
const RAW_TYPE_DECLARATION_RE =
  /^(?:export\s+)?(?:declare\s+)?(?:type|interface|enum|const\s+enum|class)\s+([A-Za-z_$][\w$]*)/gm;

/** The type names that raw declaration text declares. */
export function typeNamesInText(text: string): string[] {
  return [...text.matchAll(RAW_TYPE_DECLARATION_RE)].map((match) => match[1] ?? "");
}

function typeNamesOf(declaration: IrDeclaration): readonly string[] {
  switch (declaration.kind) {
    case "rawDeclaration":
      return declaration.name === undefined
        ? typeNamesInText(declaration.text)
        : [declaration.name];
    case "constArray":
      return [];
    default:
      return [declaration.name];
  }
}

/** Every type name the declarations take; `--enum-values` arrays are values, so they take none. */
export function typeNamesDeclaredBy(declarations: readonly IrDeclaration[]): Set<string> {
  return new Set(declarations.flatMap(typeNamesOf));
}
