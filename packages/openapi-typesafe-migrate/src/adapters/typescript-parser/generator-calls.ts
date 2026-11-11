import ts from "@typescript/typescript6";
import { type FileBindings, hasExportModifier } from "./file-bindings.js";

/**
 * The `openapiTS(source, options)` calls of a file, and where their options object is: written in
 * the call, in a module-level `const` (`openapiTS(source, options)`), or somewhere the rewriter
 * cannot see. The generator is the default import of the generator module, by any local name,
 * or `ns.default` of a namespace import (`import * as ns from "openapi-typescript"`).
 */

export type GeneratorOptions =
  /**
   * An object literal that only this call uses: it may be rewritten. `annotations` are the types
   * it is declared with: the type of its `const`, and `satisfies` or `as` around it, also as a
   * JSDoc `@type` or `@satisfies` of a JavaScript file.
   */
  | {
      readonly kind: "own";
      readonly options: ts.ObjectLiteralExpression;
      readonly annotations: readonly ts.TypeNode[];
    }
  /** An object literal in a `const` that other code uses too: it is only reported. */
  | { readonly kind: "shared"; readonly options: ts.ObjectLiteralExpression }
  /** An expression that is not an object literal of this file. */
  | { readonly kind: "unknown"; readonly expression: ts.Expression };

export interface GeneratorCall {
  readonly call: ts.CallExpression;
  /** Undefined when the call passes no options. */
  readonly options: GeneratorOptions | undefined;
}

const DEFAULT_EXPORT = "default";

function isGenerator(callee: ts.Expression, bindings: FileBindings): boolean {
  if (ts.isIdentifier(callee)) {
    return bindings.bindingOf(callee)?.kind === "generator-function";
  }
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === DEFAULT_EXPORT &&
    ts.isIdentifier(callee.expression) &&
    bindings.bindingOf(callee.expression)?.kind === "generator-module"
  );
}

/**
 * The types of the JSDoc `@type` and `@satisfies` tags of a node of a JavaScript file, which
 * TypeScript checks it with as with an annotation: `@type {T}` on `(value)` is `value as T`. In a
 * TypeScript file such a tag checks nothing.
 */
function jsDocTypes(node: ts.Node): ts.TypeNode[] {
  if ((node.flags & ts.NodeFlags.JavaScriptFile) === 0) {
    return [];
  }
  return ts
    .getJSDocTags(node)
    .filter((tag) => ts.isJSDocTypeTag(tag) || ts.isJSDocSatisfiesTag(tag))
    .map((tag) => (tag as ts.JSDocTypeTag | ts.JSDocSatisfiesTag).typeExpression.type);
}

/**
 * The expression without parentheses, `as` and `satisfies`, which do not change the value, and
 * the types of the `as` and `satisfies` around it.
 */
function unwrapped(
  expression: ts.Expression,
  types: ts.TypeNode[] = [],
): { value: ts.Expression; types: ts.TypeNode[] } {
  if (ts.isParenthesizedExpression(expression)) {
    return unwrapped(expression.expression, [...types, ...jsDocTypes(expression)]);
  }
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return unwrapped(expression.expression, [...types, expression.type]);
  }
  return { value: expression, types };
}

/** The options object a `const` holds, owned by this call when the call is its only use. */
function constantOptions(
  name: ts.Identifier,
  bindings: FileBindings,
  outerTypes: readonly ts.TypeNode[],
): GeneratorOptions {
  const binding = bindings.bindingOf(name);
  const declaration = bindings.declarationOf(name) as ts.Node;
  const found = binding?.kind === "constant" ? unwrapped(binding.initializer) : undefined;
  if (found === undefined || !ts.isObjectLiteralExpression(found.value)) {
    return { kind: "unknown", expression: name };
  }
  const isOwn = bindings.usesOf(declaration).length === 1 && !hasExportModifier(declaration);
  if (!isOwn) {
    return { kind: "shared", options: found.value };
  }
  const declared = (declaration as ts.VariableDeclaration).type;
  const annotations = [
    ...outerTypes,
    ...found.types,
    ...(declared === undefined ? [] : [declared]),
    ...jsDocTypes(declaration),
  ];
  return { kind: "own", options: found.value, annotations };
}

function optionsOf(argument: ts.Expression, bindings: FileBindings): GeneratorOptions {
  const { value, types } = unwrapped(argument);
  if (ts.isObjectLiteralExpression(value)) {
    return { kind: "own", options: value, annotations: types };
  }
  return ts.isIdentifier(value)
    ? constantOptions(value, bindings, types)
    : { kind: "unknown", expression: argument };
}

/** Every generator call of the file, in source order. */
export function generatorCalls(file: ts.SourceFile, bindings: FileBindings): GeneratorCall[] {
  const calls: GeneratorCall[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isGenerator(node.expression, bindings)) {
      const argument = node.arguments[1];
      const options = argument === undefined ? undefined : optionsOf(argument, bindings);
      calls.push({ call: node, options });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return calls;
}
