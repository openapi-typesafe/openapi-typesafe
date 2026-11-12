import { irArray, irReadonly, irReference } from "../../../domain/ir/constructors.js";
import type { IrConstArrayDeclaration, IrDeclaration, IrType } from "../../../domain/ir/nodes.js";
import { HELPER_TYPES } from "../helper-types.js";
import { literalType } from "../literal-type.js";
import { unionOf } from "../type-combinators.js";
import { type Evaluated, type Evaluation, NEVER } from "./evaluation.js";
import type { RawKeyTypes } from "./signature-index.js";
import { TypeEvaluator } from "./type-evaluation.js";

/**
 * `--enum-values` arrays are typed by the location of their schema in the generated types
 * (`FlattenedDeepRequired<components>["schemas"]["A"]["status"]`). Where that type surely does not
 * hold the values (ADR-027), the array is typed by its own values instead, so it compiles:
 * - the location indexes a key the generated type does not have (`definitions`, `allOf`, a
 *   property of `unknown`), or
 * - the type there does not admit a listed value (an `allOf` of different enums, a discriminator
 *   value the property enum does not list, an array next to other `anyOf` members).
 * Everything else stays as it was.
 */

/** Why an array got its own values as its type. */
export type EnumValuesRetype =
  /** The location's type admits only other values, or none: the document contradicts itself. */
  | { readonly kind: "excluded"; readonly name: string; readonly excluded: readonly unknown[] }
  /** The location could not be typed; nothing to report, the array is right now. */
  | { readonly kind: "untyped"; readonly name: string }
  /** The location's type surely admits other values too; the array is right now. */
  | { readonly kind: "widened"; readonly name: string };

type Admission = "yes" | "no" | "opaque";

function literalAdmission(type: IrType, value: string | number): Admission {
  switch (type.kind) {
    case "stringLiteral":
    case "numberLiteral":
      return type.value === value ? "yes" : "no";
    case "booleanLiteral":
      return "no";
    case "keyword":
      if (type.keyword === "unknown") {
        return "yes";
      }
      return type.keyword === typeof value ? "yes" : "no";
    case "object":
      // `{}` (as in `string & {}`) admits every value but `null` and `undefined`.
      return type.members.length === 0 ? "yes" : "no";
    case "array":
      return "no";
    default:
      return "opaque";
  }
}

function admission(evaluator: TypeEvaluator, value: Evaluated, item: string | number): Admission {
  const { type } = value;
  if (type.kind === "union" || type.kind === "intersection") {
    const parts = type.types.map((part) => {
      const expanded = evaluator.expand({ ...value, type: part });
      return expanded.kind === "type" ? admission(evaluator, expanded, item) : "opaque";
    });
    // A union admits a value one member admits; an intersection excludes one a part excludes.
    const decisive: Admission = type.kind === "union" ? "yes" : "no";
    if (parts.includes(decisive)) {
      return decisive;
    }
    return parts.includes("opaque") ? "opaque" : decisive === "yes" ? "no" : "yes";
  }
  return literalAdmission(type, item);
}

/** `ReadonlyArray<T>`: an array type `T` is the array itself, so its elements are checked. */
function elementOf(evaluator: TypeEvaluator, value: Evaluated): Evaluation {
  const members = evaluator.membersOf(value);
  const elements = members.map((member) =>
    member.kind === "type" && member.type.kind === "array" ? member.type.element : null,
  );
  if (members.length === 0 || elements.some((element) => element === null)) {
    return value;
  }
  return evaluator.expand({ ...value, type: unionOf(elements as IrType[]) });
}

const LITERAL_KINDS: ReadonlySet<string> = new Set([
  "stringLiteral",
  "numberLiteral",
  "booleanLiteral",
]);

/** Whether a type is made of literals only (or `never`): a finite set of values. */
function isFiniteType(evaluator: TypeEvaluator, value: Evaluated): boolean {
  const { type } = value;
  if (type.kind === "union" || type.kind === "intersection") {
    return type.types.every((part) => {
      const expanded = evaluator.expand({ ...value, type: part });
      return expanded.kind === "type" && isFiniteType(evaluator, expanded);
    });
  }
  return LITERAL_KINDS.has(type.kind) || (type.kind === "keyword" && type.keyword === "never");
}

/**
 * Whether a type surely admits a value outside `values`: a literal not listed, a boolean, or
 * `unknown`, also as one member of a union. A wide type such as `string` or `string & {}`
 * is not sure: the enum's own type may be open (`withOtherStrings`), so it counts as not wider.
 */
function admitsOtherValues(
  evaluator: TypeEvaluator,
  value: Evaluated,
  values: readonly (string | number)[],
): boolean {
  const { type } = value;
  switch (type.kind) {
    case "stringLiteral":
    case "numberLiteral":
      return !values.includes(type.value);
    case "booleanLiteral":
      return true;
    case "keyword":
      return type.keyword === "unknown";
    case "union":
      return type.types.some((part) => {
        const expanded = evaluator.expand({ ...value, type: part });
        return expanded.kind === "type" && admitsOtherValues(evaluator, expanded, values);
      });
    default:
      return false;
  }
}

function locationType(declaration: IrConstArrayDeclaration): IrType | null {
  const { type } = declaration;
  const isTyped = type.kind === "reference" && type.name === HELPER_TYPES.readonlyArray.name;
  return isTyped ? (type.typeArguments[0] ?? null) : null;
}

function retypeOf(
  evaluator: TypeEvaluator,
  declaration: IrConstArrayDeclaration,
): EnumValuesRetype | null {
  const location = locationType(declaration);
  const evaluated = location === null ? null : evaluator.evaluate(location);
  if (evaluated === null || evaluated.kind === "opaque") {
    return null;
  }
  if (evaluated.kind === "missing") {
    return { kind: "untyped", name: declaration.name };
  }
  const element = elementOf(evaluator, evaluated);
  if (element.kind !== "type") {
    return element.kind === "missing" ? { kind: "untyped", name: declaration.name } : null;
  }
  if (declaration.values.length === 0 && isNever(element.type)) {
    // The `ReadonlyArray` helper of `never` is `never` (`never` extends an array): not even `[]`.
    return { kind: "untyped", name: declaration.name };
  }
  const results = declaration.values.map((value) => admission(evaluator, element, value));
  if (!results.includes("no")) {
    const isWidened = admitsOtherValues(evaluator, element, declaration.values);
    return isWidened ? { kind: "widened", name: declaration.name } : null;
  }
  if (!isFiniteType(evaluator, element)) {
    return { kind: "untyped", name: declaration.name };
  }
  const excluded = declaration.values.filter((_, index) => results[index] === "no");
  return { kind: "excluded", name: declaration.name, excluded };
}

function isNever(type: IrType): boolean {
  return type.kind === "keyword" && type.keyword === "never";
}

/** The values' own type; with no values `readonly never[]` (`ReadonlyArray<never>` is never). */
function ownValuesType(declaration: IrConstArrayDeclaration): IrType {
  if (declaration.values.length === 0) {
    return irReadonly(irArray(NEVER));
  }
  const values = unionOf(declaration.values.map((value) => literalType(value)));
  return irReference(HELPER_TYPES.readonlyArray.name, [values]);
}

/**
 * The footer with each `--enum-values` array whose location type does not hold its values typed
 * by its own values, and why each one changed. `declarations` are the document's types;
 * `keyTypes` are the key types of the raw keys of its templated paths.
 */
export function checkedEnumValues<T>(
  footer: readonly (T | IrDeclaration)[],
  declarations: readonly IrDeclaration[],
  isDeclaration: (entry: T | IrDeclaration) => entry is IrDeclaration,
  keyTypes?: RawKeyTypes,
): { footer: (T | IrDeclaration)[]; retyped: EnumValuesRetype[] } {
  const types = [...declarations, ...footer.filter(isDeclaration)];
  const evaluator = new TypeEvaluator(types, keyTypes);
  const retyped: EnumValuesRetype[] = [];
  const checked = footer.map((entry) => {
    if (!isDeclaration(entry) || entry.kind !== "constArray") {
      return entry;
    }
    const retype = retypeOf(evaluator, entry);
    if (retype === null) {
      return entry;
    }
    retyped.push(retype);
    return { ...entry, type: ownValuesType(entry) };
  });
  return { footer: checked, retyped };
}
