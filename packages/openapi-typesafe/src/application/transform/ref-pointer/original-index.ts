import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import { generatedMember } from "./generated-shape.js";
import { childLocation, followLocated, isJsonObject, type JsonObject } from "./located-node.js";
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
import { isMarkedProperty } from "./property-shape.js";

/**
 * Whether the type the original wrote for a `$ref` (`refType`: every segment indexed by name,
 * `properties` skipped) surely fails to compile. It walks the document as TypeScript walks the
 * generated types and answers true only where TypeScript reports an error for sure, or where the
 * type compiles but is read through an index signature that is not the target's type alone
 * (`isOtherType`); where the answer depends on a shape it does not model, it answers false, so
 * that output stays as it was.
 */

type Step = "fails" | "compiles" | "continue";

interface OriginalWalk {
  readonly node: unknown;
  /** The node's JSON Pointer (`LocatedNode`). */
  readonly location: string | undefined;
  readonly isSchema: boolean;
  /** At a `$defs` map: the next segment names a definition. */
  readonly names?: JsonObject | undefined;
}

interface WalkInput {
  readonly pointer: RefPointer;
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
}

/**
 * A definition of a `$defs` map. The original reads the map through `NonNullable`, so only a
 * missing name fails, or a `$Read<T>` / `$Write<T>` definition with more segments after it.
 */
function definitionStep(
  walk: OriginalWalk & { names: JsonObject },
  segment: string,
  isLast: boolean,
  input: WalkInput,
) {
  if (!Object.hasOwn(walk.names, segment)) {
    return { step: "fails" as Step, walk };
  }
  const node = walk.names[segment];
  const isMarked = isMarkedProperty(node, input.options, input.refs);
  const location = childLocation(walk.location, segment);
  return {
    step: (isMarked && !isLast ? "fails" : "continue") as Step,
    walk: { ...walk, node, location, names: undefined },
  };
}

function schemaStep(walk: OriginalWalk, segment: string, isLast: boolean, input: WalkInput) {
  if (walk.names !== undefined) {
    return definitionStep({ ...walk, names: walk.names }, segment, isLast, input);
  }
  if (segment === "properties") {
    return { step: "continue" as Step, walk };
  }
  const member = generatedMember(walk, segment, input.options, input.refs);
  if (member.kind === "names") {
    const { names, location } = member;
    return { step: "continue" as Step, walk: { ...walk, location, names } };
  }
  // Such an index signature compiles, but its type is not the target's alone.
  if (member.kind === "missing" || (member.kind === "index" && member.isOtherType)) {
    return { step: "fails" as Step, walk };
  }
  if (member.kind === "opaque") {
    return { step: "compiles" as Step, walk };
  }
  const isAbsentValue = member.kind === "index" && member.node === undefined;
  const isUnsafe =
    member.kind === "property" ? member.isOptional || member.isMarked : isAbsentValue;
  return {
    step: (isUnsafe && !isLast ? "fails" : "continue") as Step,
    walk: { ...walk, node: member.node, location: member.location },
  };
}

function containerStep(walk: OriginalWalk, index: number, input: WalkInput) {
  const segment = input.pointer.segments[index] as string;
  const isLast = index === input.pointer.segments.length - 1;
  if (isExcludedOperation(input.pointer, index, walk.node, input)) {
    return { step: "fails" as Step, walk };
  }
  const isOptional =
    (segment === "requestBody" && isOptionalRequestBody(walk.node, input.refs)) ||
    isOptionalHeader(input.pointer, index, walk.node);
  if (isOptional && !isLast) {
    return { step: "fails" as Step, walk };
  }
  const child = followLocated(
    {
      node: isJsonObject(walk.node) ? walk.node[segment] : undefined,
      location: childLocation(walk.location, segment),
    },
    input.refs,
  );
  return {
    step: (child.node === undefined ? "compiles" : "continue") as Step,
    walk: { ...walk, ...child },
  };
}

/** The schema of the first media type of a `content` map, `$ref`s followed. */
function firstMediaTypeSchema(walk: OriginalWalk, refs: RefResolver): OriginalWalk | null {
  const content = isJsonObject(walk.node) ? walk.node.content : undefined;
  if (!isJsonObject(content)) {
    return null;
  }
  const [mediaType] = Object.keys(content);
  if (mediaType === undefined) {
    return null;
  }
  const location = childLocation(childLocation(walk.location, "content"), mediaType);
  const entry = followLocated({ node: content[mediaType], location }, refs);
  return ownSchema({ ...entry, isSchema: false }, refs);
}

/** The schema a header or parameter is typed by, `$ref`s followed. */
function ownSchema(walk: OriginalWalk, refs: RefResolver): OriginalWalk {
  const schema = isJsonObject(walk.node) ? walk.node.schema : undefined;
  const location = childLocation(walk.location, "schema");
  return { ...followLocated({ node: schema, location }, refs), isSchema: true };
}

/** The schema whose type a header or parameter is, when not its media type members. */
function contentSchema(
  walk: OriginalWalk,
  form: Exclude<ContentForm, "media-type-members">,
  refs: RefResolver,
): OriginalWalk | null {
  switch (form) {
    case "first-media-type":
      return firstMediaTypeSchema(walk, refs);
    case "schema":
      return ownSchema(walk, refs);
    case "string":
      return null;
  }
}

/**
 * The original indexes the `content` of a header or parameter by name. The media type members
 * have no `content` unless a media type is named so, and `string` and `unknown` (no media type)
 * have none; the schema of the first media type, or the `schema` next to `content`, is walked on.
 */
function contentStep(walk: OriginalWalk, form: ContentForm, isLast: boolean, input: WalkInput) {
  const content = isJsonObject(walk.node) ? walk.node.content : undefined;
  if (form === "media-type-members") {
    const hasMember = isJsonObject(content) && Object.hasOwn(content, "content");
    return { step: (hasMember ? "compiles" : "fails") as Step, walk };
  }
  const schema = contentSchema(walk, form, input.refs);
  return schema === null
    ? { step: "fails" as Step, walk }
    : schemaStep(schema, "content", isLast, input);
}

/**
 * A step outside a schema: a header's or parameter's `content`, a schema's container, or another.
 */
function documentStep(walk: OriginalWalk, index: number, input: WalkInput) {
  const segment = input.pointer.segments[index] as string;
  const isLast = index === input.pointer.segments.length - 1;
  const form = headerParameterContentForm(input.pointer, index, walk.node, input.options);
  if (form !== null) {
    return contentStep(walk, form, isLast, input);
  }
  if (isTypedAsSchema(input.pointer, index) && isJsonObject(walk.node)) {
    // The container's type is its schema's type: the segment indexes that type.
    return schemaStep(ownSchema(walk, input.refs), segment, isLast, input);
  }
  return containerStep(walk, index, input);
}

/** True when the original type of the `$ref` does not compile for sure. */
export function originalIndexFails(input: WalkInput): boolean {
  const { segments } = input.pointer;
  let walk: OriginalWalk = {
    ...leadingLocated(input.pointer, input.refs),
    isSchema: startsInSchema(input.pointer),
  };
  for (let index = leadingSegmentsOf(input.pointer); index < segments.length; index++) {
    if (!walk.isSchema && isParameterList(input.pointer, index)) {
      return true;
    }
    const isLast = index === segments.length - 1;
    const result = walk.isSchema
      ? schemaStep(walk, segments[index] as string, isLast, input)
      : documentStep(walk, index, input);
    if (result.step !== "continue") {
      return result.step === "fails";
    }
    walk = result.walk;
  }
  return false;
}
