import { irIndexedAccess, irKeyword, irReference } from "../../../domain/ir/constructors.js";
import type { IrKeyword, IrType } from "../../../domain/ir/nodes.js";
import { indexBy, indexKeyword, rootType } from "../ref-type.js";
import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import { isArrayShape, isObjectShape } from "./generated-shape.js";
import {
  childLocation,
  followLocated,
  followRefs,
  isJsonObject,
  type LocatedNode,
} from "./located-node.js";
import {
  type ContentForm,
  headerParameterContentForm,
  isExcludedOperation,
  isOptionalHeader,
  isOptionalRequestBody,
  isParameterList,
  isTypedAsSchema,
  leadingLocated,
  leadingSegmentsOf,
  type RefPointer,
  startsInSchema,
} from "./pointer-walk.js";
import {
  isExcludedProperty,
  isMarkedProperty,
  type Presence,
  propertyPresence,
  schemaPresence,
} from "./property-shape.js";

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
  /** The node's JSON Pointer, where the generator writes its type (`LocatedNode`). */
  readonly location: string | undefined;
  readonly isSchema: boolean;
  /** The segment is a property or `$defs` name, not a keyword. */
  readonly isName: boolean;
  /** The location of the map of names (`properties` or `$defs`) when `isName`. */
  readonly namesLocation?: string | undefined;
  /**
   * The node is the `content` of a header or parameter typed as its first media type, so the
   * next segment must name that media type and adds no member.
   */
  readonly isFirstMediaType?: boolean;
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
  const owner = followLocated(walk, refs);
  const child = isJsonObject(owner.node) ? owner.node[keyword] : undefined;
  return {
    ...walk,
    type: irIndexedAccess(present(walk), irKeyword(key)),
    node: child,
    location: childLocation(owner.location, keyword),
    presence: schemaPresence(child, refs),
  };
}

/**
 * A property `--exclude-deprecated` left out has no member to index, and the `$Read<T>` or
 * `$Write<T>` of a marked property has no member but the marker's: such a pointer is typed in
 * place.
 */
function nameStep(walk: TypedWalk, name: string, isLast: boolean, input: TypedWalkInput) {
  const owner = followLocated(walk, input.refs);
  const { node } = owner;
  const properties = isJsonObject(node) && isJsonObject(node.properties) ? node.properties : {};
  const value = properties[name];
  const { options, refs } = input;
  const isMarkedOnTheWay = !isLast && isMarkedProperty(value, options, refs);
  if (isExcludedProperty(value, options, refs) || isMarkedOnTheWay) {
    return null;
  }
  const type =
    walk.presence === "present"
      ? indexKeyword(walk.type, name, isLast)
      : indexBy(present(walk), name);
  return {
    ...walk,
    type,
    node: value,
    location: childLocation(walk.namesLocation, name),
    isName: false,
    presence: propertyPresence(walk, name, input.options, input.refs),
  };
}

/** `$defs` is optional (`NonNullable` when more follows); its members are present. */
function defsStep(walk: TypedWalk, owner: LocatedNode, isLast: boolean): TypedWalk {
  const { node } = owner;
  const defs = isJsonObject(node) && isJsonObject(node[DEFS_KEYWORD]) ? node[DEFS_KEYWORD] : {};
  const namesLocation = childLocation(owner.location, DEFS_KEYWORD);
  return {
    ...walk,
    type: indexKeyword(present(walk), DEFS_KEYWORD, isLast),
    // A node of its own, not in the document: its properties are the definitions.
    node: { properties: defs, required: Object.keys(defs) },
    location: namesLocation,
    namesLocation,
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
  const owner = followLocated(walk, input.refs);
  if (!hasKeywordMember(owner.node, segment)) {
    return null;
  }
  switch (segment) {
    case "properties":
      return { ...walk, isName: true, namesLocation: childLocation(owner.location, segment) };
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
    location: childLocation(followLocated(walk, input.refs).location, segment),
    presence: isOptional ? "absent" : "present",
  };
}

/**
 * The `content` of a header or parameter: no member of its own, since the type holds its media
 * types (or the first one's type). Untyped where the type is `string` or a `schema`'s, and as the
 * last segment of the first media type form, whose type is not the map's.
 */
function contentStep(walk: TypedWalk, form: ContentForm, isLast: boolean, refs: RefResolver) {
  const isMapTyped = form === "media-type-members" || (form === "first-media-type" && !isLast);
  if (!isMapTyped) {
    return null;
  }
  const owner = followLocated(walk, refs);
  return {
    ...walk,
    node: isJsonObject(owner.node) ? owner.node.content : undefined,
    location: childLocation(owner.location, "content"),
    isFirstMediaType: form === "first-media-type",
  };
}

/** The first media type of such a `content` is the type itself; another one has no type. */
function firstMediaTypeStep(walk: TypedWalk, segment: string): TypedWalk | null {
  const content = isJsonObject(walk.node) ? walk.node : {};
  if (Object.keys(content)[0] !== segment) {
    return null;
  }
  const location = childLocation(walk.location, segment);
  return { ...walk, node: content[segment], location, isFirstMediaType: false };
}

function schemaStep(walk: TypedWalk, refs: RefResolver): TypedWalk {
  const owner = followLocated(walk, refs);
  const schema = isJsonObject(owner.node) ? owner.node.schema : undefined;
  const location = childLocation(owner.location, "schema");
  // The container's type is its schema's type: an optional header stays optional.
  const presence = walk.presence === "absent" ? "absent" : schemaPresence(schema, refs);
  return { ...walk, node: schema, location, isSchema: true, presence };
}

function documentStep(walk: TypedWalk, index: number, input: TypedWalkInput): TypedWalk | null {
  const owner = followRefs(walk.node, input.refs);
  const form = headerParameterContentForm(input.pointer, index, owner, input.options);
  if (form !== null) {
    const isLast = index === input.pointer.segments.length - 1;
    return contentStep(walk, form, isLast, input.refs);
  }
  if (
    isParameterList(input.pointer, index) ||
    isExcludedOperation(input.pointer, index, owner, input)
  ) {
    return null;
  }
  return containerStep(walk, index, input);
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
  if (walk.isFirstMediaType) {
    return firstMediaTypeStep(walk, segment);
  }
  if (segment === "schema" && isTypedAsSchema(input.pointer, index)) {
    return schemaStep(walk, input.refs);
  }
  return documentStep(walk, index, input);
}

/** Walk the whole pointer; see the module comment. */
export function typedWalk(input: TypedWalkInput): TypedWalkResult {
  const { pointer } = input;
  const { node, location } = leadingLocated(pointer, input.refs);
  const isSchema = startsInSchema(pointer);
  let walk: TypedWalk = {
    type: indexBy(
      rootType(pointer.rootSegment, false),
      ...pointer.segments.slice(0, leadingSegmentsOf(pointer)),
    ),
    node,
    location,
    isSchema,
    isName: false,
    presence: isSchema ? schemaPresence(node, input.refs) : "present",
  };
  for (let index = leadingSegmentsOf(pointer); index < pointer.segments.length; index++) {
    const next = step(walk, index, input);
    if (next === null) {
      return { kind: "untyped", index };
    }
    walk = next;
  }
  return { kind: "typed", walk };
}
