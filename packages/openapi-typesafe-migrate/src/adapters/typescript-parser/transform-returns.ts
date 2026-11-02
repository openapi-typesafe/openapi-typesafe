import ts from "@typescript/typescript6";
import { type FactoryNames, typeTextOf } from "./factory-type-text.js";

/** A replacement of a source range by new text. */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** The returned expressions of a function, without those of functions nested in it. */
export function returnedExpressions(body: ts.ConciseBody): (ts.Expression | undefined)[] {
  if (!ts.isBlock(body)) {
    return [body];
  }
  const returned: (ts.Expression | undefined)[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) {
      return;
    }
    if (ts.isReturnStatement(node)) {
      returned.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return returned;
}

const isUndefined = (expression: ts.Expression): boolean =>
  (ts.isIdentifier(expression) && expression.text === "undefined") ||
  ts.isVoidExpression(expression);

function typeTextEdit(expression: ts.Expression, names: FactoryNames): TextEdit[] | undefined {
  const typeText = typeTextOf(expression, names);
  if (typeText === undefined) {
    return undefined;
  }
  const start = expression.getStart();
  return [{ start, end: expression.getEnd(), text: JSON.stringify(typeText.text) }];
}

/** `{ schema: <type>, questionToken: … }`: only the `schema` value changes. */
function resultObjectEdits(
  object: ts.ObjectLiteralExpression,
  names: FactoryNames,
): TextEdit[] | undefined {
  const schema = object.properties.find(
    (property) =>
      property.name !== undefined &&
      ts.isIdentifier(property.name) &&
      property.name.text === "schema",
  );
  const isPlain = object.properties.every(ts.isPropertyAssignment);
  if (schema === undefined || !isPlain || !ts.isPropertyAssignment(schema)) {
    return undefined;
  }
  return typeTextEdit(schema.initializer, names);
}

/**
 * The edits that turn one returned expression into type text, or undefined when it is not one of
 * the known type-building forms. `undefined` (keep the generated type) needs no edit.
 */
export function returnEdits(
  expression: ts.Expression | undefined,
  names: FactoryNames,
): TextEdit[] | undefined {
  if (expression === undefined || isUndefined(expression)) {
    return [];
  }
  if (ts.isParenthesizedExpression(expression)) {
    return returnEdits(expression.expression, names);
  }
  if (ts.isConditionalExpression(expression)) {
    const whenTrue = returnEdits(expression.whenTrue, names);
    const whenFalse = returnEdits(expression.whenFalse, names);
    return whenTrue === undefined || whenFalse === undefined
      ? undefined
      : [...whenTrue, ...whenFalse];
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return resultObjectEdits(expression, names);
  }
  return typeTextEdit(expression, names);
}
