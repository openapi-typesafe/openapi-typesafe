import { irReference } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { literalType } from "../literal-type.js";
import { unionOf } from "../type-combinators.js";
import {
  type Alternative,
  alternativesOf,
  declarationOf,
  type ListedAlternative,
  type ValueForm,
  valueTypeOf,
} from "./base-alternatives.js";
import type { BaseSchema } from "./base-schemas.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * The values of an enum or `const` at a place where an `allOf` intersects it with other schemas
 * (`Cat: allOf: [$ref: Pet, { mode: [a] }]`). A TypeScript enum (`--enum`) intersects only with
 * its own members: `CatMode & PetMode`, `CatMode & ("a" | "b")` and `"a" & PetMode` are all
 * `never`. So a value is typed in the form that the other schemas admit it in: by the members of
 * a base's enum (`PetMode.a`), or as a literal where a base lists it as one.
 */

/** How one value is typed: as the schema types it, as a base lists it, or as no value. */
type ValueTarget =
  | { readonly kind: "own" }
  | { readonly kind: "listed"; readonly alternative: ListedAlternative }
  | { readonly kind: "missing" };

const OWN: ValueTarget = { kind: "own" };
const MISSING: ValueTarget = { kind: "missing" };

function lists(alternative: ListedAlternative, value: unknown): boolean {
  const key = JSON.stringify(value);
  return alternative.values.some((listed) => JSON.stringify(listed) === key);
}

function listing(alternatives: readonly Alternative[], value: unknown, form: ValueForm) {
  return alternatives.find(
    (alternative): alternative is ListedAlternative =>
      alternative.kind === "listed" && alternative.form === form && lists(alternative, value),
  );
}

/** Whether an alternative admits the value whatever its form: a type, or other strings. */
function admitsAnyForm(alternative: Alternative, value: unknown, form: ValueForm): boolean {
  if (alternative.kind === "any") {
    return alternative.types === null || alternative.types.has(valueTypeOf(value));
  }
  // An open enum admits a string literal; its members are its enum's, as before.
  return form === "literal" && alternative.isOpen && typeof value === "string";
}

function hasEnum(alternatives: readonly Alternative[]): boolean {
  return alternatives.some(
    (alternative) => alternative.kind === "listed" && alternative.form === "enum",
  );
}

/**
 * The target of a value at a base: its own form where the base admits it so, else the form the
 * base lists it in (an enum's members first), else no value (`missing`). Literals intersect as
 * they should, so a literal is no value of a base only where that base has an enum.
 */
function targetAtBase(
  value: unknown,
  alternatives: readonly Alternative[],
  form: ValueForm,
): ValueTarget {
  const isAdmitted =
    alternatives.some((alternative) => admitsAnyForm(alternative, value, form)) ||
    (form === "literal" && listing(alternatives, value, "literal") !== undefined);
  if (isAdmitted) {
    return OWN;
  }
  const listed = listing(alternatives, value, "enum") ?? listing(alternatives, value, "literal");
  if (listed !== undefined) {
    return { kind: "listed", alternative: listed };
  }
  return form === "literal" && !hasEnum(alternatives) ? OWN : MISSING;
}

/**
 * The target of a value at an inline schema intersected with it: a value that schema admits only
 * as a member of its enum is typed by that member. A value it does not list keeps its form; the
 * intersection leaves it out, as two enums of one place do, and nothing warns: the document
 * narrows the place itself.
 */
function targetAtSibling(value: unknown, alternatives: readonly Alternative[]): ValueTarget {
  const target = targetAtBase(value, alternatives, "literal");
  return target === MISSING ? OWN : target;
}

/** The targets of the values at one base; null where every value keeps its form there. */
interface Decision {
  readonly base: BaseSchema;
  readonly targets: readonly ValueTarget[];
}

function decisionAt(
  base: BaseSchema,
  values: readonly unknown[],
  form: ValueForm,
  request: SchemaRequest,
) {
  const alternatives = alternativesOf(base, request);
  if (alternatives === null) {
    return null;
  }
  const targets = values.map((value) =>
    base.pointer === null
      ? targetAtSibling(value, alternatives)
      : targetAtBase(value, alternatives, form),
  );
  return targets.every((target) => target === OWN) ? null : { base, targets };
}

/**
 * Whether the values can take the form an inline schema next to them lists them in: a literal
 * always (that schema's enum stays as it is), an enum member only of a later part of the `allOf`,
 * so of two enums each typed by the other's members, one keeps its own.
 */
function isInlineTarget(base: BaseSchema, form: ValueForm): boolean {
  return base.pointer === null && (form === "literal" || base.inline?.isLater === true);
}

/**
 * The first base that types a value in another form. Bases typed at their own location come
 * first: the place cannot change their type. Then the inline schemas next to the place's own.
 */
function decisionOf(values: readonly unknown[], form: ValueForm, request: SchemaRequest) {
  const fixed = request.baseSchemas.filter((base) => base.pointer !== null);
  const inline = request.baseSchemas.filter((base) => isInlineTarget(base, form));
  for (const base of [...fixed, ...inline]) {
    const decision = decisionAt(base, values, form, request);
    if (decision !== null) {
      return decision;
    }
  }
  return null;
}

/** How the values of one group are typed: in their own form, or as a base lists them. */
type GroupKey = ListedAlternative | typeof OWN;

/**
 * The values a decision types, grouped by how they are typed, in the order of their first value:
 * a union lists the values as the document does. Missing values are in no group.
 */
function typedGroups(values: readonly unknown[], decision: Decision) {
  const groups = new Map<GroupKey, unknown[]>();
  decision.targets.forEach((target, index) => {
    if (target.kind === "missing") {
      return;
    }
    const key = target.kind === "listed" ? target.alternative : target;
    groups.set(key, [...(groups.get(key) ?? []), values[index]]);
  });
  return groups;
}

function listedType(alternative: ListedAlternative, values: unknown[], request: SchemaRequest) {
  if (alternative.form === "literal") {
    return values.map(literalType);
  }
  const name = request.context.footer.addEnum(declarationOf(alternative.base, request));
  return [{ ...irReference(name), enumValues: values as (string | number)[] }];
}

/** Values that no alternative of the base admits: no value of the place can be one of them. */
function reportMissing(
  decision: Decision,
  values: readonly unknown[],
  request: SchemaRequest,
  hasCommonValues: boolean,
): void {
  const missing = values.filter((_, index) => decision.targets[index] === MISSING);
  // An inline schema leaves no value missing (`targetAtSibling`): only a base has a pointer.
  if (missing.length === 0 || decision.base.pointer === null) {
    return;
  }
  const path = request.location.path ?? "";
  const found = {
    path,
    base: decision.base.pointer,
    values: missing as (string | number)[],
    hasCommonValues,
  };
  request.context.enumInheritance?.reportNotInherited(found);
}

/** How a value list types the values that keep their form. */
export type OwnValuesType = (values: readonly unknown[]) => readonly IrType[];

/**
 * The type of `values`, typed by `ownType` in `form`, at a place where an `allOf` intersects
 * them with other schemas. Null where every value keeps its form, or no value can be one of
 * the bases' (the type stays `never`, as the document says).
 */
export function baseValuesType(
  values: readonly unknown[],
  form: ValueForm,
  ownType: OwnValuesType,
  request: SchemaRequest,
): IrType | null {
  const decision = request.baseSchemas.length === 0 ? null : decisionOf(values, form, request);
  if (decision === null) {
    return null;
  }
  const types = [...typedGroups(values, decision)].flatMap(([key, grouped]) =>
    key.kind === "own" ? ownType(grouped) : listedType(key, grouped, request),
  );
  reportMissing(decision, values, request, types.length > 0);
  return types.length === 0 ? null : unionOf(types);
}
