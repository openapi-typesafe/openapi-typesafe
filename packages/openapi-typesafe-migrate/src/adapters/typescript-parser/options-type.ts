import ts from "@typescript/typescript6";
import type { TextEdit } from "../../domain/text-edits.js";
import { type FileBindings, GENERATOR_MODULES } from "./file-bindings.js";

/**
 * The options type of a rewritten `transform`. `OpenAPITSOptions` types the TypeScript-node
 * callbacks, so options declared with it (`const options: OpenAPITSOptions`, `satisfies
 * OpenAPITSOptions`) stopped compiling once `irCallbacks: true` and type text were in them. The
 * annotations of rewritten options name `OpenAPITSIrOptions`, the type of the IR callbacks.
 */

const TS_NODE_OPTIONS = "OpenAPITSOptions";
const IR_OPTIONS = "OpenAPITSIrOptions";
const TYPE_MODIFIER = "type ";

/** `import("openapi-typescript").OpenAPITSOptions`: its `OpenAPITSOptions`, or undefined. */
function importTypeName(node: ts.ImportTypeNode): ts.Identifier | undefined {
  const { argument, qualifier } = node;
  const isGeneratorModule =
    ts.isLiteralTypeNode(argument) &&
    ts.isStringLiteral(argument.literal) &&
    GENERATOR_MODULES.has(argument.literal.text);
  const isOptions =
    !node.isTypeOf &&
    qualifier !== undefined &&
    ts.isIdentifier(qualifier) &&
    qualifier.text === TS_NODE_OPTIONS;
  return isGeneratorModule && isOptions ? qualifier : undefined;
}

/** The name a type reference or an `extends` names (`A`, `ns.A`), or undefined. */
function referencedName(node: ts.Node): ts.Node | undefined {
  if (ts.isTypeReferenceNode(node)) {
    return node.typeName;
  }
  return ts.isExpressionWithTypeArguments(node) ? node.expression : undefined;
}

/** The two parts of `ns.A`: a qualified type name, or the expression of an `extends`. */
function qualifiedParts(name: ts.Node): { left: ts.Node; right: ts.Node } | undefined {
  if (ts.isQualifiedName(name)) {
    return { left: name.left, right: name.right };
  }
  return ts.isPropertyAccessExpression(name)
    ? { left: name.expression, right: name.name }
    : undefined;
}

/**
 * The identifier of `OpenAPITSOptions` that a type reference or an `extends` names, by any local
 * name of its import, as `ns.OpenAPITSOptions` of a namespace import or as an import type, or
 * undefined.
 */
function optionsTypeName(node: ts.Node, bindings: FileBindings): ts.Identifier | undefined {
  if (ts.isImportTypeNode(node)) {
    return importTypeName(node);
  }
  const name = referencedName(node);
  if (name !== undefined && ts.isIdentifier(name)) {
    const binding = bindings.bindingOf(name);
    return binding?.kind === "helper-import" && binding.name === TS_NODE_OPTIONS ? name : undefined;
  }
  const parts = name === undefined ? undefined : qualifiedParts(name);
  if (parts === undefined || !ts.isIdentifier(parts.left) || !ts.isIdentifier(parts.right)) {
    return undefined;
  }
  const isGeneratorModule = bindings.bindingOf(parts.left)?.kind === "generator-module";
  return isGeneratorModule && parts.right.text === TS_NODE_OPTIONS ? parts.right : undefined;
}

/**
 * The declaration of a type of this file that a type reference or an `extends` names: an alias,
 * an interface or a JSDoc `@typedef`, or undefined.
 */
function localTypeOf(node: ts.Node, bindings: FileBindings): ts.Node | undefined {
  const name = referencedName(node);
  const binding =
    name !== undefined && ts.isIdentifier(name) ? bindings.bindingOf(name) : undefined;
  return binding?.kind === "local-type" ? binding.declaration : undefined;
}

/**
 * Whether a type names `OpenAPITSOptions` anywhere in it (`Partial<OpenAPITSOptions>`), also
 * through a type of this file (`type Opts = OpenAPITSOptions`), which the rewrite does not change.
 */
function mentionsOptionsType(
  node: ts.Node,
  bindings: FileBindings,
  seen: Set<ts.Node> = new Set(),
): boolean {
  const local = localTypeOf(node, bindings);
  const isNewLocal = local !== undefined && !seen.has(local);
  if (isNewLocal) {
    seen.add(local);
  }
  const mentions = (child: ts.Node) => mentionsOptionsType(child, bindings, seen) || undefined;
  return (
    (isNewLocal && mentionsOptionsType(local, bindings, seen)) ||
    optionsTypeName(node, bindings) !== undefined ||
    (ts.forEachChild(node, mentions) ?? false)
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
 * are its only uses, the import names `OpenAPITSIrOptions` instead; else it is imported too. A
 * JavaScript file imports it with a JSDoc `@import` and names it in JSDoc comments, whose uses
 * TypeScript's API does not all list, so there it is always imported too.
 */
function importEdits(
  specifier: ts.ImportSpecifier,
  references: readonly ts.Identifier[],
  bindings: FileBindings,
): TextEdit[] {
  const isJavaScript = (specifier.flags & ts.NodeFlags.JavaScriptFile) !== 0;
  const isOnlyUse =
    !isJavaScript && bindings.usesOf(specifier).every((use) => references.includes(use));
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
