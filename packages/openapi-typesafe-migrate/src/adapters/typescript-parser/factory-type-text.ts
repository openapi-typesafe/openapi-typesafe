import ts from "@typescript/typescript6";

/**
 * TypeScript type text for the `ts.factory` expressions of the classic `transform` recipe
 * (`createTypeReferenceNode`, keywords, `null` and literal types, unions, intersections, arrays),
 * and for the openapi-typesafe helper constants and `tsUnion` / `tsIntersection`. Anything else
 * returns undefined, so the callback is left as it is. Module-level constants such as
 * `const DATE = ts.factory.createTypeReferenceNode("Date")` are followed by name.
 */

/** How the file refers to the TypeScript module and to the openapi-typesafe helpers. */
export interface FactoryNames {
  /** Local names of the `typescript` module (`ts` in `import ts from "typescript"`). */
  readonly typescriptModules: ReadonlySet<string>;
  /** Local name → imported name, for named imports from `typescript` (`factory`, `SyntaxKind`). */
  readonly typescriptImports: ReadonlyMap<string, string>;
  /** Local name → imported name, for named imports from `openapi-typesafe`. */
  readonly helperImports: ReadonlyMap<string, string>;
  /** Initializers of module-level `const` declarations, by name. */
  readonly constants: ReadonlyMap<string, ts.Expression>;
}

const KEYWORDS: ReadonlyMap<string, string> = new Map([
  ["AnyKeyword", "any"],
  ["BigIntKeyword", "bigint"],
  ["BooleanKeyword", "boolean"],
  ["NeverKeyword", "never"],
  ["NumberKeyword", "number"],
  ["ObjectKeyword", "object"],
  ["StringKeyword", "string"],
  ["SymbolKeyword", "symbol"],
  ["UndefinedKeyword", "undefined"],
  ["UnknownKeyword", "unknown"],
  ["VoidKeyword", "void"],
]);

const HELPER_CONSTANTS: ReadonlyMap<string, string> = new Map([
  ["BOOLEAN", "boolean"],
  ["FALSE", "false"],
  ["NEVER", "never"],
  ["NULL", "null"],
  ["NUMBER", "number"],
  ["STRING", "string"],
  ["TRUE", "true"],
  ["UNDEFINED", "undefined"],
  ["UNKNOWN", "unknown"],
]);

/** A type name the type text can hold as written: `Date`, `Foo.Bar`. */
const TYPE_NAME_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

/** A type with a `|` or `&` at the top needs parentheses inside `[]`, and a union inside `&`. */
interface TypeText {
  readonly text: string;
  readonly operator: "|" | "&" | null;
}

const plain = (text: string): TypeText => ({ text, operator: null });

/** `ts.factory.createX` or `factory.createX`: the factory method name, if that is the callee. */
function factoryMethod(callee: ts.Expression, names: FactoryNames): string | undefined {
  if (!ts.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const target = callee.expression;
  const isFactory = ts.isIdentifier(target)
    ? names.typescriptImports.get(target.text) === "factory"
    : ts.isPropertyAccessExpression(target) &&
      target.name.text === "factory" &&
      ts.isIdentifier(target.expression) &&
      names.typescriptModules.has(target.expression.text);
  return isFactory ? callee.name.text : undefined;
}

/** `ts.SyntaxKind.StringKeyword` or `SyntaxKind.StringKeyword`: the member name. */
function syntaxKindMember(expression: ts.Expression, names: FactoryNames): string | undefined {
  if (!ts.isPropertyAccessExpression(expression)) {
    return undefined;
  }
  const target = expression.expression;
  const isSyntaxKind = ts.isIdentifier(target)
    ? names.typescriptImports.get(target.text) === "SyntaxKind"
    : ts.isPropertyAccessExpression(target) &&
      target.name.text === "SyntaxKind" &&
      ts.isIdentifier(target.expression) &&
      names.typescriptModules.has(target.expression.text);
  return isSyntaxKind ? expression.name.text : undefined;
}

function typeName(argument: ts.Expression | undefined, names: FactoryNames): string | undefined {
  if (argument === undefined) {
    return undefined;
  }
  if (ts.isStringLiteralLike(argument)) {
    return TYPE_NAME_RE.test(argument.text) ? argument.text : undefined;
  }
  if (
    ts.isCallExpression(argument) &&
    factoryMethod(argument.expression, names) === "createIdentifier"
  ) {
    return typeName(argument.arguments[0], names);
  }
  return undefined;
}

function literalText(argument: ts.Expression | undefined, names: FactoryNames): string | undefined {
  if (argument === undefined || !ts.isCallExpression(argument)) {
    return undefined;
  }
  const method = factoryMethod(argument.expression, names);
  const [value] = argument.arguments;
  switch (method) {
    case "createNull":
      return "null";
    case "createTrue":
      return "true";
    case "createFalse":
      return "false";
    case "createStringLiteral":
      return value !== undefined && ts.isStringLiteralLike(value)
        ? JSON.stringify(value.text)
        : undefined;
    case "createNumericLiteral":
      return value !== undefined && (ts.isNumericLiteral(value) || ts.isStringLiteralLike(value))
        ? String(Number(value.text))
        : undefined;
    default:
      return undefined;
  }
}

function joined(
  elements: ts.Expression | undefined,
  operator: "|" | "&",
  names: FactoryNames,
): TypeText | undefined {
  if (
    elements === undefined ||
    !ts.isArrayLiteralExpression(elements) ||
    elements.elements.length === 0
  ) {
    return undefined;
  }
  const parts = elements.elements.map((element) => typeTextOf(element, names));
  if (parts.some((part) => part === undefined)) {
    return undefined;
  }
  const texts = (parts as TypeText[]).map((part) =>
    operator === "&" && part.operator === "|" ? `(${part.text})` : part.text,
  );
  return { text: texts.join(` ${operator} `), operator: texts.length > 1 ? operator : null };
}

function factoryCallText(
  call: ts.CallExpression,
  method: string,
  names: FactoryNames,
): TypeText | undefined {
  const [first, second] = call.arguments;
  switch (method) {
    case "createTypeReferenceNode": {
      const name = second === undefined ? typeName(first, names) : undefined;
      return name === undefined ? undefined : plain(name);
    }
    case "createKeywordTypeNode": {
      const keyword =
        first === undefined ? undefined : KEYWORDS.get(syntaxKindMember(first, names) ?? "");
      return keyword === undefined ? undefined : plain(keyword);
    }
    case "createLiteralTypeNode": {
      const literal = literalText(first, names);
      return literal === undefined ? undefined : plain(literal);
    }
    case "createUnionTypeNode":
      return joined(first, "|", names);
    case "createIntersectionTypeNode":
      return joined(first, "&", names);
    case "createArrayTypeNode": {
      const element = first === undefined ? undefined : typeTextOf(first, names);
      return element === undefined
        ? undefined
        : plain(element.operator ? `(${element.text})[]` : `${element.text}[]`);
    }
    default:
      return undefined;
  }
}

function helperCallText(call: ts.CallExpression, names: FactoryNames): TypeText | undefined {
  if (!ts.isIdentifier(call.expression)) {
    return undefined;
  }
  const helper = names.helperImports.get(call.expression.text);
  if (helper === "tsUnion") {
    return joined(call.arguments[0], "|", names);
  }
  return helper === "tsIntersection" ? joined(call.arguments[0], "&", names) : undefined;
}

function identifierText(identifier: ts.Identifier, names: FactoryNames): TypeText | undefined {
  const helper = names.helperImports.get(identifier.text);
  const constant = helper === undefined ? undefined : HELPER_CONSTANTS.get(helper);
  if (constant !== undefined) {
    return plain(constant);
  }
  const initializer = names.constants.get(identifier.text);
  return initializer === undefined ? undefined : typeTextOf(initializer, names);
}

/** The type text of an expression that builds a type, or undefined. */
export function typeTextOf(expression: ts.Expression, names: FactoryNames): TypeText | undefined {
  if (ts.isParenthesizedExpression(expression)) {
    return typeTextOf(expression.expression, names);
  }
  if (ts.isIdentifier(expression)) {
    return identifierText(expression, names);
  }
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }
  const method = factoryMethod(expression.expression, names);
  return method === undefined
    ? helperCallText(expression, names)
    : factoryCallText(expression, method, names);
}
