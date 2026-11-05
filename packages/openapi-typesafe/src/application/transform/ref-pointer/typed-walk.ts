import { irIndexedAccess, irKeyword, irReference } from "../../../domain/ir/constructors.js";
import type { IrKeyword, IrType } from "../../../domain/ir/nodes.js";
import { indexBy, indexKeyword, rootType } from "../ref-type.js";
import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import {
  followRefs,
  isArrayShape,
  isJsonObject,
  isObjectShape,
  type Presence,
  propertyPresence,
  schemaPresence,
} from "./generated-shape.js";
import {
  isOptionalHeader,
  isOptionalRequestBody,
  isParameterList,
  isTypedAsSchema,
  LEADING_SEGMENTS,
  leadingNode,
  type RefPointer,
  startsInSchema,
} from "./pointer-walk.js";

/**
 * The type of a `$ref` pointer as the generated types have it: the `schema` of a media type,
 * header or component parameter is its type, `items` is indexed by `number`,
 * `additionalProperties` by `string`, and a value that may be `undefined` or `null` is wrapped in
 * `NonNullable` before it is indexed. The walk stops at a segment with no type of its own
 * (`allOf/0`, `definitions/A`, operation `parameters/0`): the caller types the target itself.
 */

const DEFS_KEYWORD = "$defs";

export interface TypedWalk {
  readonly type: IrType;
  /** The document node the type stands for (not followed through a `$ref`). */
  readonly node: unknown;
  readonly isSchema: boolean;
  /** The segment is a property or `$defs` name, not a keyword. */
  readonly isName: boolean;
  readonly presence: Presence;
}

export interface TypedWalkInput {
  readonly pointer: RefPointer;
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
}

/** The walk result: a type, or the index of the first segment that has no type. */
export type TypedWalkResult =
  | { readonly kind: "typed"; readonly walk: TypedWalk }
  | { readonly kind: "untyped"; readonly index: number };

function present(walk: TypedWalk): IrType {
  return walk.presence === "present" ? walk.type : irReference("NonNullable", [walk.type]);
}

function indexEntries(walk: TypedWalk, key: IrKeyword, keyword: string, refs: RefResolver) {
  const owner = followRefs(walk.node, refs);
  const child = isJsonObject(owner) ? owner[keyword] : undefined;
  return {
    ...walk,
    type: irIndexedAccess(present(walk), irKeyword(key)),
    node: child,
    presence: schemaPresence(child, refs),
  };
}

function nameStep(walk: TypedWalk, name: string, isLast: boolean, input: TypedWalkInput) {
  const owner = followRefs(walk.node, input.refs);
  const properties = isJsonObject(owner) && isJsonObject(owner.properties) ? owner.properties : {};
  const type =
    walk.presence === "present"
      ? indexKeyword(walk.type, name, isLast)
      : indexBy(present(walk), name);
  return {
    ...walk,
    type,
    node: properties[name],
    isName: false,
    presence: propertyPresence(walk.node, name, input.options, input.refs),
  };
}

/** `$defs` is optional (`NonNullable` when more follows); its members are present. */
function defsStep(walk: TypedWalk, owner: unknown, isLast: boolean): TypedWalk {
  const defs = isJsonObject(owner) && isJsonObject(owner[DEFS_KEYWORD]) ? owner[DEFS_KEYWORD] : {};
  return {
    ...walk,
    type: indexKeyword(present(walk), DEFS_KEYWORD, isLast),
    node: { properties: defs, required: Object.keys(defs) },
    isName: true,
    presence: "present",
  };
}

const SHAPED_KEYWORDS: ReadonlySet<string> = new Set([
  "properties",
  "items",
  "additionalProperties",
]);

/**
 * Whether the keyword gives the owner's generated type a member: `items` only an array,
 * `properties` and `additionalProperties` only an object (`type: string` ignores them). A node
 * that is not in the document is indexed as the keyword says.
 */
function hasKeywordMember(owner: unknown, segment: string): boolean {
  if (!SHAPED_KEYWORDS.has(segment) || !isJsonObject(owner)) {
    return true;
  }
  return segment === "items" ? isArrayShape(owner) : isObjectShape(owner);
}

function keywordStep(walk: TypedWalk, segment: string, isLast: boolean, input: TypedWalkInput) {
  const owner = followRefs(walk.node, input.refs);
  if (!hasKeywordMember(owner, segment)) {
    return null;
  }
  switch (segment) {
    case "properties":
      return { ...walk, isName: true };
    case "items":
      return indexEntries(walk, "number", "items", input.refs);
    case "additionalProperties":
      return indexEntries(walk, "string", "additionalProperties", input.refs);
    case DEFS_KEYWORD:
      return defsStep(walk, owner, isLast);
    default:
      return null;
  }
}

function containerStep(walk: TypedWalk, index: number, input: TypedWalkInput): TypedWalk {
  const segment = input.pointer.segments[index] as string;
  const owner = followRefs(walk.node, input.refs);
  const isOptional =
    (segment === "requestBody" && isOptionalRequestBody(owner, input.refs)) ||
    isOptionalHeader(input.pointer, index, owner);
  return {
    ...walk,
    type: indexBy(present(walk), segment),
    node: isJsonObject(owner) ? owner[segment] : undefined,
    presence: isOptional ? "absent" : "present",
  };
}

function step(walk: TypedWalk, index: number, input: TypedWalkInput): TypedWalk | null {
  const { segments } = input.pointer;
  const segment = segments[index] as string;
  const isLast = index === segments.length - 1;
  if (walk.isSchema) {
    return walk.isName
      ? nameStep(walk, segment, isLast, input)
      : keywordStep(walk, segment, isLast, input);
  }
  if (segment === "schema" && isTypedAsSchema(input.pointer, index)) {
    const owner = followRefs(walk.node, input.refs);
    const schema = isJsonObject(owner) ? owner.schema : undefined;
    // The container's type is its schema's type: an optional header stays optional.
    const presence = walk.presence === "absent" ? "absent" : schemaPresence(schema, input.refs);
    return { ...walk, node: schema, isSchema: true, presence };
  }
  return isParameterList(input.pointer, index) ? null : containerStep(walk, index, input);
}

/** Walk the whole pointer; see the module comment. */
export function typedWalk(input: TypedWalkInput): TypedWalkResult {
  const { pointer } = input;
  const node = leadingNode(pointer, input.refs);
  const isSchema = startsInSchema(pointer);
  let walk: TypedWalk = {
    type: indexBy(
      rootType(pointer.rootSegment, false),
      ...pointer.segments.slice(0, LEADING_SEGMENTS),
    ),
    node,
    isSchema,
    isName: false,
    presence: isSchema ? schemaPresence(node, input.refs) : "present",
  };
  for (let index = LEADING_SEGMENTS; index < pointer.segments.length; index++) {
    const next = step(walk, index, input);
    if (next === null) {
      return { kind: "untyped", index };
    }
    walk = next;
  }
  return { kind: "typed", walk };
}
