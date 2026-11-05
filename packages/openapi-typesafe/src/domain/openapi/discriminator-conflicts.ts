import { admittedPropertyValues, resolveLocalRef } from "./admitted-values.js";
import { createRef, escapePointerSegment, parseRefPointer } from "./json-pointer.js";

/**
 * Discriminator members whose discriminator value their own property does not allow. By the
 * Discriminator Object rule, a member that no `mapping` entry names has its schema name as the
 * value, so with a property `enum` (or `const`) that does not list it no value of the member
 * matches, and where the generator adds the value to the member the property type is `never`.
 * Each one gets a warning (CODING_PRINCIPLES §8.7).
 */

export interface DiscriminatorValueConflict {
  /** The member schema, such as `#/components/schemas/EpisodeObject`. */
  readonly member: string;
  /** The schema that has the Discriminator Object. */
  readonly owner: string;
  readonly propertyName: string;
  /** The values the discriminator gives the member: its mapping keys, or its name. */
  readonly values: readonly string[];
  /** The values the member's property allows. */
  readonly allowed: readonly (string | number | boolean | null)[];
  /** Whether no mapping entry names the member, so its value is its schema name. */
  readonly isImplicit: boolean;
}

type JsonObject = Readonly<Record<string, unknown>>;

const COMPONENT_SCHEMAS = "#/components/schemas/";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface Owner {
  readonly pointer: string;
  readonly propertyName: string;
  readonly mapping: Readonly<Record<string, string>>;
  readonly memberRefs: readonly string[];
}

function refsOf(list: unknown): string[] {
  return (Array.isArray(list) ? list : []).flatMap((item) =>
    isObject(item) && typeof item.$ref === "string" ? [item.$ref] : [],
  );
}

function mappingTarget(target: string): string {
  return target.startsWith("#") ? target : `${COMPONENT_SCHEMAS}${escapePointerSegment(target)}`;
}

function ownerAt(node: JsonObject, pointer: () => string): Owner | null {
  const discriminator = node.discriminator;
  if (!isObject(discriminator) || typeof discriminator.propertyName !== "string") {
    return null;
  }
  const mapping = isObject(discriminator.mapping)
    ? (discriminator.mapping as Readonly<Record<string, string>>)
    : {};
  const mapped = Object.values(mapping)
    .filter((t) => typeof t === "string")
    .map(mappingTarget);
  const memberRefs = [...refsOf(node.oneOf), ...refsOf(node.anyOf), ...mapped];
  return { pointer: pointer(), propertyName: discriminator.propertyName, mapping, memberRefs };
}

/** A node of the document walk; the pointer is built only for the nodes that need it. */
interface Visit {
  readonly node: unknown;
  readonly key: string | null;
  readonly parent: Visit | null;
}

function pointerOf(visit: Visit): string {
  const segments: string[] = [];
  for (let current: Visit | null = visit; current?.key != null; current = current.parent) {
    segments.unshift(current.key);
  }
  return createRef(segments);
}

function childrenOf(visit: Visit): Visit[] {
  const { node } = visit;
  const entries: [string, unknown][] = Array.isArray(node)
    ? node.map((item, index) => [String(index), item])
    : isObject(node)
      ? Object.entries(node)
      : [];
  return entries.map(([key, child]) => ({ node: child, key, parent: visit }));
}

/**
 * Every Discriminator Object of the document, depth first, with its pointer. The walk keeps its
 * own stack, so a document nested past the call stack fails in the transform, as it did before.
 */
function ownersIn(document: unknown): Owner[] {
  const found: Owner[] = [];
  const stack: Visit[] = [{ node: document, key: null, parent: null }];
  for (let visit = stack.pop(); visit !== undefined; visit = stack.pop()) {
    const owner = isObject(visit.node) ? ownerAt(visit.node, () => pointerOf(visit)) : null;
    if (owner !== null) {
      found.push(owner);
    }
    stack.push(...childrenOf(visit).reverse());
  }
  return found;
}

/** Component schemas that inherit the owner through `allOf: [{ $ref: owner }]`. */
function inheritingMembers(owner: Owner, document: unknown): string[] {
  const schemas = resolveLocalRef(document, "#/components/schemas");
  if (!isObject(schemas)) {
    return [];
  }
  return Object.entries(schemas).flatMap(([name, schema]) =>
    isObject(schema) && refsOf(schema.allOf).includes(owner.pointer)
      ? [`${COMPONENT_SCHEMAS}${escapePointerSegment(name)}`]
      : [],
  );
}

function memberValues(owner: Owner, member: string): { values: string[]; isImplicit: boolean } {
  const values = Object.entries(owner.mapping)
    .filter(([, target]) => typeof target === "string" && mappingTarget(target) === member)
    .map(([key]) => key);
  const name = parseRefPointer(member).pop() ?? "";
  return values.length > 0 ? { values, isImplicit: false } : { values: [name], isImplicit: true };
}

function conflictOf(owner: Owner, member: string, document: unknown) {
  // The owner's own property is left out of an inheriting member's type (`Omit`).
  const allowed = admittedPropertyValues(
    resolveLocalRef(document, member),
    owner.propertyName,
    document,
    new Set([owner.pointer]),
  );
  const { values, isImplicit } = memberValues(owner, member);
  if (allowed === null || values.some((value) => allowed.has(value))) {
    return null;
  }
  const { pointer, propertyName } = owner;
  return { member, owner: pointer, propertyName, values, allowed: [...allowed], isImplicit };
}

/** The conflicts of the document, one per member and value list, in document order. */
export function findDiscriminatorValueConflicts(
  document: unknown,
): readonly DiscriminatorValueConflict[] {
  const conflicts = new Map<string, DiscriminatorValueConflict>();
  for (const owner of ownersIn(document)) {
    const members = new Set([...owner.memberRefs, ...inheritingMembers(owner, document)]);
    for (const member of members) {
      const conflict = conflictOf(owner, member, document);
      const key = JSON.stringify([member, conflict?.propertyName, conflict?.values]);
      if (conflict !== null && !conflicts.has(key)) {
        conflicts.set(key, conflict);
      }
    }
  }
  return [...conflicts.values()];
}
