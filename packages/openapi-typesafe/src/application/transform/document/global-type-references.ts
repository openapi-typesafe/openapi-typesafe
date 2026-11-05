import type { IrDeclaration } from "../../../domain/ir/nodes.js";

/**
 * The TypeScript global types that generated code can refer to: in references (`Record<string,
 * never>`, `Omit<…>`, the `Blob` of `--binary-as-blob`) and in the text of footer helpers
 * (`Exclude<…>`, `Readonly<…>`). A module declaration of the same name shadows the global: every
 * use of it then fails to compile, or silently names the module's type (`Blob`).
 */
const GLOBAL_TYPE_NAMES: ReadonlySet<string> = new Set([
  "Array",
  "Blob",
  "Exclude",
  "Extract",
  "NonNullable",
  "Omit",
  "Partial",
  "Pick",
  "Readonly",
  "ReadonlyArray",
  "Record",
  "Required",
]);

const GENERIC_USE = /\b([A-Z][A-Za-z]*)\s*</g;

/** `origin` holds the outside node a raw type was printed from; it is not part of the output. */
const SKIPPED_KEYS: ReadonlySet<string> = new Set(["origin", "comments"]);

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function addTextUses(text: string, used: Set<string>): void {
  for (const match of text.matchAll(GENERIC_USE)) {
    const name = match[1] ?? "";
    if (GLOBAL_TYPE_NAMES.has(name)) {
      used.add(name);
    }
  }
}

function addNodeUses(node: Readonly<Record<string, unknown>>, used: Set<string>): void {
  if (node.kind === "reference" && typeof node.name === "string") {
    if (GLOBAL_TYPE_NAMES.has(node.name)) {
      used.add(node.name);
    }
  } else if (
    (node.kind === "raw" || node.kind === "rawDeclaration") &&
    typeof node.text === "string"
  ) {
    addTextUses(node.text, used);
  }
}

function visit(value: unknown, used: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, used);
    }
    return;
  }
  if (!isObject(value)) {
    return;
  }
  addNodeUses(value, used);
  for (const [key, child] of Object.entries(value)) {
    if (!SKIPPED_KEYS.has(key)) {
      visit(child, used);
    }
  }
}

/** The TypeScript global type names that the declarations refer to. */
export function globalTypeReferences(declarations: readonly IrDeclaration[]): Set<string> {
  const used = new Set<string>();
  visit(declarations, used);
  return used;
}
