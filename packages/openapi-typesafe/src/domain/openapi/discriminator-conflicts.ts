import { appendAll } from "../append-all.js";
import { admittedPropertyValues, resolveLocalRef } from "./admitted-values.js";
import { isUnionMember, unionAt } from "./discriminated-union.js";
import {
  appendPointer,
  canonicalRef,
  escapePointerSegment,
  parseRefPointer,
  ROOT_POINTER,
} from "./json-pointer.js";

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

/** A mapping value as a canonical `$ref`: Redocly writes it percent-decoded (`canonicalRef`). */
function mappingTarget(target: string): string {
  return target.startsWith("#")
    ? canonicalRef(target)
    : `${COMPONENT_SCHEMAS}${escapePointerSegment(target)}`;
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
  return appendPointer(ROOT_POINTER, segments);
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
    appendAll(stack, childrenOf(visit).reverse());
  }
  return found;
}

/** A member and the `$ref`s whose properties its type leaves out (`Omit` of its parents). */
interface Member {
  readonly ref: string;
  readonly skipped: ReadonlySet<string>;
}

interface Child {
  readonly ref: string;
  readonly schema: JsonObject;
}

/** How the run types an `allOf` of a discriminated union. */
export interface ConflictOptions {
  /**
   * `allof-discriminated-union`: a schema that `allOf`s a union which does not contain it reuses
   * the union and gets no value, so neither it nor the schemas below it are members.
   */
  readonly isUnionReused: boolean;
}

/** What the search for conflicts reads: the document and its `allOf` children by parent. */
interface ConflictSearch extends ConflictOptions {
  readonly document: unknown;
  readonly children: ReadonlyMap<string, readonly Child[]>;
}

/** The `allOf` children of the owner that inherit its discriminator. */
function inheritingChildren(owner: Owner, search: ConflictSearch): readonly Child[] {
  const children = search.children.get(owner.pointer) ?? [];
  const resolve = (ref: string) => resolveLocalRef(search.document, ref);
  const union = search.isUnionReused ? unionAt(owner.pointer, resolve) : undefined;
  return union === undefined
    ? children
    : children.filter((child) => isUnionMember(union, child.ref, resolve));
}

/** The component schemas whose `allOf` holds a `$ref`, by that `$ref`, in document order. */
function allOfChildren(document: unknown): Map<string, Child[]> {
  const schemas = resolveLocalRef(document, "#/components/schemas");
  const children = new Map<string, Child[]>();
  for (const [name, schema] of Object.entries(isObject(schemas) ? schemas : {})) {
    if (!isObject(schema)) {
      continue;
    }
    const child = { ref: `${COMPONENT_SCHEMAS}${escapePointerSegment(name)}`, schema };
    for (const parent of new Set(refsOf(schema.allOf))) {
      const siblings = children.get(parent) ?? [];
      siblings.push(child);
      children.set(parent, siblings);
    }
  }
  return children;
}

/** Whether a schema defines a discriminator of the property itself: it is the owner below. */
function ownsProperty(schema: JsonObject, propertyName: string): boolean {
  const discriminator = schema.discriminator;
  return isObject(discriminator) && discriminator.propertyName === propertyName;
}

/**
 * Component schemas that inherit the owner through `allOf`, also through a chain
 * (`Lion: { allOf: [Cat] }`, `Cat: { allOf: [Pet] }`). Each parent on the way is left out of the
 * member's values, as its type omits the property. A schema with its own discriminator of the
 * property is a member, but the schemas below it are its own members.
 */
function inheritingMembers(owner: Owner, search: ConflictSearch): Member[] {
  const found: Member[] = [];
  const visited = new Set([owner.pointer]);
  const parents: Member[] = [{ ref: owner.pointer, skipped: new Set([owner.pointer]) }];
  for (let parent = parents.shift(); parent !== undefined; parent = parents.shift()) {
    const children =
      parent.ref === owner.pointer
        ? inheritingChildren(owner, search)
        : (search.children.get(parent.ref) ?? []);
    for (const child of children) {
      if (visited.has(child.ref)) {
        continue;
      }
      visited.add(child.ref);
      found.push({ ref: child.ref, skipped: parent.skipped });
      if (!ownsProperty(child.schema, owner.propertyName)) {
        parents.push({ ref: child.ref, skipped: new Set([...parent.skipped, child.ref]) });
      }
    }
  }
  return found;
}

/** The members of an owner, each once: the listed and mapped ones, then the inheriting ones. */
function membersOf(owner: Owner, search: ConflictSearch): Member[] {
  const listed = owner.memberRefs.map((ref) => ({ ref, skipped: new Set([owner.pointer]) }));
  const members = new Map<string, Member>();
  for (const member of [...listed, ...inheritingMembers(owner, search)]) {
    // A member may be listed by a `$ref` and found by its pointer: both name it canonically.
    const key = canonicalRef(member.ref);
    if (!members.has(key)) {
      members.set(key, member);
    }
  }
  return [...members.values()];
}

function memberValues(owner: Owner, member: string): { values: string[]; isImplicit: boolean } {
  const values = Object.entries(owner.mapping)
    .filter(
      ([, target]) => typeof target === "string" && mappingTarget(target) === canonicalRef(member),
    )
    .map(([key]) => key);
  const name = parseRefPointer(member).pop() ?? "";
  return values.length > 0 ? { values, isImplicit: false } : { values: [name], isImplicit: true };
}

function conflictOf(owner: Owner, { ref: member, skipped }: Member, document: unknown) {
  // The owner's own property is left out of an inheriting member's type (`Omit`).
  const allowed = admittedPropertyValues(
    resolveLocalRef(document, member),
    owner.propertyName,
    document,
    skipped,
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
  options: ConflictOptions = { isUnionReused: false },
): readonly DiscriminatorValueConflict[] {
  const conflicts = new Map<string, DiscriminatorValueConflict>();
  const search = { ...options, document, children: allOfChildren(document) };
  for (const owner of ownersIn(document)) {
    for (const member of membersOf(owner, search)) {
      const conflict = conflictOf(owner, member, document);
      const key = JSON.stringify([member.ref, conflict?.propertyName, conflict?.values]);
      if (conflict !== null && !conflicts.has(key)) {
        conflicts.set(key, conflict);
      }
    }
  }
  return [...conflicts.values()];
}
