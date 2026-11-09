import { hasIdentifierStart, withIdentifierParts } from "./identifier-text.js";
import type { IrKeyword, IrPropertySignature, IrType } from "./nodes.js";

/**
 * Whether a value from outside the package (an IR callback's result) is IR the printer writes as
 * valid TypeScript. JavaScript callers can return any value, and the type checker of a
 * TypeScript caller does not stop `{ kind: "union", types: [] }` or an empty type text either:
 * without this check such a result crashed the printer with an untyped error, or printed text
 * such as `a?: ;`. Raw type text is printed as written, so only blank text is rejected; the text
 * itself is the caller's TypeScript, which the caller's compiler checks.
 */

type Fields = Readonly<Record<string, unknown>>;

const KEYWORDS: ReadonlySet<string> = new Set<IrKeyword>([
  "string",
  "number",
  "boolean",
  "null",
  "undefined",
  "unknown",
  "never",
]);

const STRING_ENCODINGS: ReadonlySet<unknown> = new Set([undefined, "json", "escaped"]);

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isIdentifier(text: unknown): boolean {
  return typeof text === "string" && hasIdentifierStart(text) && withIdentifierParts(text) === text;
}

/** The prefix of a type query: the generator writes `typeof Status` as a reference name. */
const TYPE_QUERY_PREFIX = "typeof ";

/**
 * A name TypeScript reads as the name of a type: identifiers joined by `.` (`Status`,
 * `Status.active`), optionally as a type query (`typeof Status`). Text such as `a b` or `A<B>`
 * would print as other or invalid TypeScript; type arguments go in `typeArguments`.
 */
function isTypeName(text: unknown): boolean {
  if (typeof text !== "string") {
    return false;
  }
  const entityName = text.startsWith(TYPE_QUERY_PREFIX)
    ? text.slice(TYPE_QUERY_PREFIX.length)
    : text;
  return entityName.split(".").every(isIdentifier);
}

/** A non-negative number written as JavaScript writes it, as `toPropertyName` makes them. */
function isNumberName(text: unknown): boolean {
  return typeof text === "string" && String(Number(text)) === text && !text.startsWith("-");
}

/** Walks one value; `ancestors` makes a cycle invalid instead of an endless recursion. */
class IrShapeCheck {
  readonly #ancestors = new Set<object>();

  isType(value: unknown): boolean {
    return this.#within(value, (node) => {
      const check = TYPE_CHECKS[node.kind as IrType["kind"]];
      return Object.hasOwn(TYPE_CHECKS, String(node.kind)) && check(node, this);
    });
  }

  isTypeList(value: unknown, isEmptyAllowed: boolean): boolean {
    return (
      Array.isArray(value) &&
      (isEmptyAllowed || value.length > 0) &&
      value.every((entry) => this.isType(entry))
    );
  }

  isMember(value: unknown): boolean {
    return isFields(value) && value.kind === "indexSignature"
      ? this.#within(value, (node) => this.#isIndexSignature(node))
      : this.isProperty(value);
  }

  isProperty(value: unknown): boolean {
    return this.#within(
      value,
      (node) =>
        node.kind === "property" &&
        isPropertyName(node.name) &&
        this.isType(node.type) &&
        typeof node.isOptional === "boolean" &&
        typeof node.isReadonly === "boolean" &&
        areComments(node.comments),
    );
  }

  #isIndexSignature(node: Fields): boolean {
    return (
      isIdentifier(node.parameterName) &&
      this.isType(node.parameterType) &&
      this.isType(node.type) &&
      typeof node.isReadonly === "boolean" &&
      areComments(node.comments)
    );
  }

  #within(value: unknown, check: (node: Fields) => boolean): boolean {
    if (!isFields(value) || this.#ancestors.has(value)) {
      return false;
    }
    this.#ancestors.add(value);
    try {
      return check(value);
    } finally {
      this.#ancestors.delete(value);
    }
  }
}

function isPropertyName(value: unknown): boolean {
  if (!isFields(value)) {
    return false;
  }
  switch (value.kind) {
    case "identifier":
      return isIdentifier(value.text);
    case "number":
      return isNumberName(value.text);
    case "string":
      return typeof value.value === "string";
    default:
      return false;
  }
}

/** A block comment must not end itself early (`*\/`); a line comment must stay on its line. */
function isComment(value: unknown): boolean {
  if (!isFields(value) || typeof value.text !== "string") {
    return false;
  }
  return value.kind === "block"
    ? !value.text.includes("*/")
    : value.kind === "line" && !/[\n\r\u2028\u2029]/.test(value.text);
}

function areComments(value: unknown): boolean {
  return Array.isArray(value) && value.every(isComment);
}

function isTupleElement(value: unknown, check: IrShapeCheck): boolean {
  return (
    isFields(value) &&
    check.isType(value.type) &&
    typeof value.isRest === "boolean" &&
    typeof value.isOptional === "boolean" &&
    !(value.isRest && value.isOptional)
  );
}

/** One check per kind; the `Record` makes a new kind fail to compile until it is checked. */
const TYPE_CHECKS: Readonly<
  Record<IrType["kind"], (node: Fields, check: IrShapeCheck) => boolean>
> = {
  keyword: (node) => KEYWORDS.has(node.keyword as string),
  stringLiteral: (node) => typeof node.value === "string" && STRING_ENCODINGS.has(node.encoding),
  numberLiteral: (node) => Number.isFinite(node.value),
  booleanLiteral: (node) => typeof node.value === "boolean",
  reference: (node, check) => isTypeName(node.name) && check.isTypeList(node.typeArguments, true),
  array: (node, check) => check.isType(node.element),
  tuple: (node, check) =>
    Array.isArray(node.elements) && node.elements.every((entry) => isTupleElement(entry, check)),
  union: (node, check) => check.isTypeList(node.types, false),
  intersection: (node, check) => check.isTypeList(node.types, false),
  object: (node, check) =>
    Array.isArray(node.members) && node.members.every((member) => check.isMember(member)),
  indexedAccess: (node, check) => check.isType(node.object) && check.isType(node.index),
  readonly: (node, check) => check.isType(node.type),
  raw: (node) => isText(node.text),
};

/** Whether `value` is an IR type the printer writes as valid TypeScript. */
export function isPrintableIrType(value: unknown): value is IrType {
  return new IrShapeCheck().isType(value);
}

/** Whether `value` is an IR property signature the printer writes as valid TypeScript. */
export function isPrintableIrProperty(value: unknown): value is IrPropertySignature {
  return new IrShapeCheck().isProperty(value);
}
