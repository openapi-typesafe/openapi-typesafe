import ts from "@typescript/typescript6";
import type { FactoryNames } from "./factory-type-text.js";
import { hasExportModifier } from "./file-bindings.js";

/**
 * The function a `transform` option holds, and what else knows that function: other uses of a
 * module-level function, and the type its `const` is declared with.
 */

/** The function a `const` or a function declaration of this file holds. */
function namedFunction(
  name: ts.Identifier,
  names: FactoryNames,
): ts.FunctionLikeDeclaration | undefined {
  const binding = names.bindings.bindingOf(name);
  if (binding?.kind === "function") {
    return binding.declaration;
  }
  const value = binding?.kind === "constant" ? binding.initializer : undefined;
  return value !== undefined && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
    ? value
    : undefined;
}

/** The name a `transform` property gives its value: `transform: name`, or `{ transform }`. */
function namedValue(property: ts.ObjectLiteralElementLike): ts.Identifier | undefined {
  if (ts.isShorthandPropertyAssignment(property)) {
    return property.name;
  }
  return ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)
    ? property.initializer
    : undefined;
}

/**
 * The function a `transform` property holds: a method, an arrow function or a function, inline or
 * by the name of a module-level function.
 */
export function callbackFunction(
  property: ts.ObjectLiteralElementLike,
  names: FactoryNames,
): ts.FunctionLikeDeclaration | undefined {
  if (ts.isMethodDeclaration(property)) {
    return property;
  }
  const name = namedValue(property);
  if (name !== undefined) {
    return namedFunction(name, names);
  }
  const value = ts.isPropertyAssignment(property) ? property.initializer : undefined;
  return value !== undefined && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
    ? value
    : undefined;
}

/** The type a `const` that `transform` names is declared with (`OpenAPITSOptions["transform"]`). */
export function callbackAnnotations(
  property: ts.ObjectLiteralElementLike,
  names: FactoryNames,
): ts.TypeNode[] {
  const name = namedValue(property);
  const declaration = name === undefined ? undefined : names.bindings.declarationOf(name);
  const type =
    declaration !== undefined && ts.isVariableDeclaration(declaration)
      ? declaration.type
      : undefined;
  return type === undefined ? [] : [type];
}

/**
 * A function named by `transform` is rewritten only when this is its only use and it is not
 * exported: other callers, in this file or in the modules that import it, would get type text
 * where they expect nodes.
 */
export function isSharedFunction(
  property: ts.ObjectLiteralElementLike,
  names: FactoryNames,
): boolean {
  const name = namedValue(property);
  const declaration = name === undefined ? undefined : names.bindings.declarationOf(name);
  return (
    declaration !== undefined &&
    (names.bindings.usesOf(declaration).length > 1 || hasExportModifier(declaration))
  );
}
