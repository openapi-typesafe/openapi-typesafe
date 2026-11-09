import ts from "@typescript/typescript6";
import type { FileBindings } from "./file-bindings.js";

/**
 * The `openapiTS(source, options)` calls of a file, and where their options object is: written in
 * the call, in a module-level `const` (`openapiTS(source, options)`), or somewhere the rewriter
 * cannot see. The generator is the default import of the generator module, by any local name,
 * or `ns.default` of a namespace import (`import * as ns from "openapi-typescript"`).
 */

export type GeneratorOptions =
  /** An object literal that only this call uses: it may be rewritten. */
  | { readonly kind: "own"; readonly options: ts.ObjectLiteralExpression }
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

/** The expression without parentheses, `as` and `satisfies`, which do not change the value. */
function unwrapped(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapped(expression.expression);
  }
  return expression;
}

const isExported = (declaration: ts.Node): boolean =>
  (ts.getCombinedModifierFlags(declaration as ts.Declaration) & ts.ModifierFlags.Export) !== 0;

/** The options object a `const` holds, owned by this call when the call is its only use. */
function constantOptions(name: ts.Identifier, bindings: FileBindings): GeneratorOptions {
  const binding = bindings.bindingOf(name);
  const declaration = bindings.declarationOf(name);
  const value = binding?.kind === "constant" ? unwrapped(binding.initializer) : undefined;
  if (value === undefined || !ts.isObjectLiteralExpression(value)) {
    return { kind: "unknown", expression: name };
  }
  const isOwn = bindings.usesOf(declaration as ts.Node).length === 1;
  return { kind: isOwn && !isExported(declaration as ts.Node) ? "own" : "shared", options: value };
}

function optionsOf(argument: ts.Expression, bindings: FileBindings): GeneratorOptions {
  const value = unwrapped(argument);
  if (ts.isObjectLiteralExpression(value)) {
    return { kind: "own", options: value };
  }
  return ts.isIdentifier(value)
    ? constantOptions(value, bindings)
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
