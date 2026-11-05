import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import { followRefs, generatedMember, isJsonObject } from "./generated-shape.js";
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
 * Whether the type the original wrote for a `$ref` (`refType`: every segment indexed by name,
 * `properties` skipped) surely fails to compile. It walks the document as TypeScript walks the
 * generated types and answers true only where TypeScript reports an error for sure; where the
 * answer depends on a shape it does not model, it answers false, so that output stays as it was.
 */

type Step = "fails" | "compiles" | "continue";

interface OriginalWalk {
  readonly node: unknown;
  readonly isSchema: boolean;
}

interface WalkInput {
  readonly pointer: RefPointer;
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
}

function schemaStep(walk: OriginalWalk, segment: string, isLast: boolean, input: WalkInput) {
  if (segment === "properties") {
    return { step: "continue" as Step, walk };
  }
  const member = generatedMember(walk.node, segment, input.options, input.refs);
  if (member.kind === "missing") {
    return { step: "fails" as Step, walk };
  }
  if (member.kind === "opaque") {
    return { step: "compiles" as Step, walk };
  }
  const isAbsentValue = member.kind === "index" && member.node === undefined;
  const isUnsafe = member.kind === "property" ? member.isOptional : isAbsentValue;
  return {
    step: (isUnsafe && !isLast ? "fails" : "continue") as Step,
    walk: { ...walk, node: member.node },
  };
}

function containerStep(walk: OriginalWalk, index: number, input: WalkInput) {
  const segment = input.pointer.segments[index] as string;
  const isLast = index === input.pointer.segments.length - 1;
  const isOptional =
    (segment === "requestBody" && isOptionalRequestBody(walk.node, input.refs)) ||
    isOptionalHeader(input.pointer, index, walk.node);
  if (isOptional && !isLast) {
    return { step: "fails" as Step, walk };
  }
  const child = isJsonObject(walk.node) ? followRefs(walk.node[segment], input.refs) : undefined;
  return {
    step: (child === undefined ? "compiles" : "continue") as Step,
    walk: { ...walk, node: child },
  };
}

/** True when the original type of the `$ref` does not compile for sure. */
export function originalIndexFails(input: WalkInput): boolean {
  const { segments } = input.pointer;
  let walk: OriginalWalk = {
    node: leadingNode(input.pointer, input.refs),
    isSchema: startsInSchema(input.pointer),
  };
  for (let index = LEADING_SEGMENTS; index < segments.length; index++) {
    const segment = segments[index] as string;
    const isLast = index === segments.length - 1;
    if (!walk.isSchema && isParameterList(input.pointer, index)) {
      return true;
    }
    if (!walk.isSchema && isTypedAsSchema(input.pointer, index) && isJsonObject(walk.node)) {
      // The container's type is its schema's type: the segment indexes that type.
      walk = { node: followRefs(walk.node.schema, input.refs), isSchema: true };
    }
    const result = walk.isSchema
      ? schemaStep(walk, segment, isLast, input)
      : containerStep(walk, index, input);
    if (result.step !== "continue") {
      return result.step === "fails";
    }
    walk = result.walk;
  }
  return false;
}
