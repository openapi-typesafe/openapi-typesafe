import ts from "@typescript/typescript6";
import type { TextEdit } from "../../domain/text-edits.js";
import type { FileBindings } from "./file-bindings.js";

/**
 * The options type of a rewritten `transform`. `OpenAPITSOptions` types the TypeScript-node
 * callbacks, so options declared with it (`const options: OpenAPITSOptions`, `satisfies
 * OpenAPITSOptions`) stopped compiling once `irCallbacks: true` and type text were in them. The
 * annotations of rewritten options name `OpenAPITSIrOptions`, the type of the IR callbacks.
 */

const TS_NODE_OPTIONS = "OpenAPITSOptions";
const IR_OPTIONS = "OpenAPITSIrOptions";
const TYPE_MODIFIER = "type ";

/**
 * The identifier of `OpenAPITSOptions` that a type reference names, by any local name of its
 * import or as `ns.OpenAPITSOptions` of a namespace import, or undefined.
 */
function optionsTypeName(node: ts.Node, bindings: FileBindings): ts.Identifier | undefined {
  if (!ts.isTypeReferenceNode(node)) {
    return undefined;
  }
  const name = node.typeName;
  if (ts.isIdentifier(name)) {
    const binding = bindings.bindingOf(name);
    return binding?.kind === "helper-import" && binding.name === TS_NODE_OPTIONS ? name : undefined;
  }
  const isGeneratorModule =
    ts.isIdentifier(name.left) && bindings.bindingOf(name.left)?.kind === "generator-module";
  return isGeneratorModule && name.right.text === TS_NODE_OPTIONS ? name.right : undefined;
}

/** Whether a type names `OpenAPITSOptions` anywhere in it (`Partial<OpenAPITSOptions>`). */
function mentionsOptionsType(node: ts.Node, bindings: FileBindings): boolean {
  return (
    optionsTypeName(node, bindings) !== undefined ||
    (ts.forEachChild(node, (child) => mentionsOptionsType(child, bindings) || undefined) ?? false)
  );
}

/**
 * The `OpenAPITSOptions` names to retarget in the annotations of rewritten options: an annotation
 * that is the type (`OpenAPITSOptions`) or a member of it (`OpenAPITSOptions["transform"]`).
 * Undefined when one names it otherwise (`Partial<OpenAPITSOptions>`): the tool cannot tell the IR
 * type of that, so the `transform` is not rewritten.
 */
export function optionsTypeReferences(
  annotations: readonly ts.TypeNode[],
  bindings: FileBindings,
): ts.Identifier[] | undefined {
  const references: ts.Identifier[] = [];
  for (const annotation of annotations) {
    const target = ts.isIndexedAccessTypeNode(annotation) ? annotation.objectType : annotation;
    const reference = optionsTypeName(target, bindings);
    if (reference !== undefined) {
      references.push(reference);
    } else if (mentionsOptionsType(annotation, bindings)) {
      return undefined;
    }
  }
  return references;
}

const renamed = (identifier: ts.Identifier, text: string): TextEdit => ({
  start: identifier.getStart(),
  end: identifier.getEnd(),
  text,
});

/** The local name of an import of `OpenAPITSIrOptions` that the file has, or undefined. */
function importedIrOptions(bindings: FileBindings): string | undefined {
  for (const [declaration, binding] of bindings.declarations) {
    if (binding.kind === "helper-import" && binding.name === IR_OPTIONS) {
      return (declaration as ts.ImportSpecifier).name.text;
    }
  }
  return undefined;
}

/**
 * The edits for the references of one import of `OpenAPITSOptions`. When the rewritten options
 * are its only uses, the import names `OpenAPITSIrOptions` instead; else it is imported too.
 */
function importEdits(
  specifier: ts.ImportSpecifier,
  references: readonly ts.Identifier[],
  bindings: FileBindings,
): TextEdit[] {
  const isOnlyUse = bindings.usesOf(specifier).every((use) => references.includes(use));
  if (isOnlyUse && specifier.propertyName !== undefined) {
    return [renamed(specifier.propertyName as ts.Identifier, IR_OPTIONS)];
  }
  const uses = references.map((reference) => renamed(reference, IR_OPTIONS));
  if (isOnlyUse) {
    return [renamed(specifier.name, IR_OPTIONS), ...uses];
  }
  const isTypeImport = specifier.parent.parent.isTypeOnly;
  const added = `, ${isTypeImport ? "" : TYPE_MODIFIER}${IR_OPTIONS}`;
  return [{ start: specifier.getEnd(), end: specifier.getEnd(), text: added }, ...uses];
}

/** The edits that make the references name `OpenAPITSIrOptions`, with its import. */
export function optionsTypeEdits(
  references: readonly ts.Identifier[],
  bindings: FileBindings,
): TextEdit[] {
  const edits: TextEdit[] = [];
  const byImport = new Map<ts.ImportSpecifier, ts.Identifier[]>();
  const existing = importedIrOptions(bindings);
  for (const reference of new Set(references)) {
    const specifier = bindings.declarationOf(reference);
    if (specifier === undefined || !ts.isImportSpecifier(specifier)) {
      edits.push(renamed(reference, IR_OPTIONS));
    } else if (existing !== undefined) {
      edits.push(renamed(reference, existing));
    } else {
      byImport.set(specifier, [...(byImport.get(specifier) ?? []), reference]);
    }
  }
  for (const [specifier, found] of byImport) {
    edits.push(...importEdits(specifier, found, bindings));
  }
  return edits;
}
