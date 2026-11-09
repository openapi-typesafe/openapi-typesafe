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
 * Words that cannot start the name of a type query (`typeof <name>`): `import` starts an import
 * type, and strict mode reserves the others. Found with the TypeScript 5.4 and 6.0 compilers
 * (syntax and grammar errors) on `type A = { a?: typeof <name> }`, over every reserved word and
 * contextual keyword. A name after a `.` may be any identifier, reserved words included.
 */
const NOT_TYPE_QUERY_START: ReadonlySet<string> = new Set(
  "import implements interface let package private protected public static yield".split(" "),
);
/** Words that cannot start a type reference either: they are operators of a type there. */
const NOT_TYPE_REFERENCE_START: ReadonlySet<string> = new Set([
  ...NOT_TYPE_QUERY_START,
  ..."new typeof infer keyof readonly unique".split(" "),
]);

/**
 * A name TypeScript reads as the name of a type: identifiers joined by `.` (`Status`,
 * `Status.active`), optionally as a type query (`typeof Status`). Text such as `a b` or `A<B>`
 * would print as other or invalid TypeScript, and so would `keyof` or `let` as the first name;
 * type arguments go in `typeArguments`.
 */
function isTypeName(text: unknown): boolean {
  if (typeof text !== "string") {
    return false;
  }
  const isQuery = text.startsWith(TYPE_QUERY_PREFIX);
  const names = (isQuery ? text.slice(TYPE_QUERY_PREFIX.length) : text).split(".");
  const reserved = isQuery ? NOT_TYPE_QUERY_START : NOT_TYPE_REFERENCE_START;
  return names.every(isIdentifier) && !reserved.has(names[0] as string);
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
      isIndexParameterType(node.parameterType as IrType) &&
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

/** The keywords an index signature takes as its parameter type. */
const INDEX_PARAMETER_KEYWORDS: ReadonlySet<string> = new Set(["string", "number"]);

/**
 * Whether a type can be the parameter type of an index signature. TypeScript takes `string`,
 * `number`, `symbol`, a template literal type, a union of these, or one of them tagged by an
 * intersection (`string & {}`); anything else fails with TS1268 or TS1337. It decides by the
 * resolved type, so a name, an indexed access (`K["a"]`) and type text pass here and TypeScript
 * checks them; an object, an array, a tuple, a literal or `readonly` can never be one, and is
 * refused.
 */
function isIndexParameterType(type: IrType): boolean {
  switch (type.kind) {
    case "keyword":
      return INDEX_PARAMETER_KEYWORDS.has(type.keyword);
    case "reference":
    case "indexedAccess":
    case "raw":
      return true;
    case "union":
      return type.types.every(isIndexParameterType);
    case "intersection":
      return type.types.some(isIndexParameterType);
    default:
      return false;
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
