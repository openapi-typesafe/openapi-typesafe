import { irIndexedAccess, irKeyword, irReference } from "../../domain/ir/constructors.js";
import type { IrKeyword, IrType } from "../../domain/ir/nodes.js";
import { parseRefPointer } from "../../domain/openapi/json-pointer.js";
import {
  extractVariantsWith,
  InvalidRefError,
  indexBy,
  indexKeyword,
  refType,
  rootType,
} from "./ref-type.js";

/**
 * The type of a schema `$ref` into the generated types. A JSON pointer names schema keywords
 * (`content/application~1json/schema`, `items`, `allOf/0`) that the generated types do not have:
 * a media type is its schema type, an array is indexed by `number`, and `allOf` members are merged.
 * The original indexed these keywords by name, and the output did not compile (TS2339).
 */

const INDEX_RE = /^\d+$/;
const DEFS_KEYWORD = "$defs";

interface Walk {
  readonly type: IrType;
  /** Inside a schema, where segments are keywords. Before it, they index the generated type. */
  readonly isSchema: boolean;
  /** The segment is a property or `$defs` name, not a keyword. */
  readonly isName: boolean;
  /** After an `anyOf`/`oneOf` member, so each property narrows the union with `Extract`. */
  readonly isVariant: boolean;
  /** The segment is the index of an `allOf`/`anyOf`/`oneOf` member, which is not indexed. */
  readonly isMemberIndex: boolean;
}

/** The `schema` of `content/<media type>`, `headers/<name>` or `components/parameters/<name>`. */
function isSchemaKeyword(pointer: readonly string[], index: number, rootSegment: string): boolean {
  if (pointer[index] !== "schema") {
    return false;
  }
  const owner = pointer[index - 2];
  const isComponentParameter =
    rootSegment === "components" && index === 2 && owner === "parameters";
  return owner === "content" || owner === "headers" || isComponentParameter;
}

/**
 * `NonNullable<T>[number]` or `NonNullable<T>[string]`: an optional or nullable array or record
 * includes `undefined` or `null`, which have no index signature (TS2537).
 */
function indexEntries(type: IrType, key: IrKeyword): IrType {
  return irIndexedAccess(irReference("NonNullable", [type]), irKeyword(key));
}

function indexName(walk: Walk, name: string, isLast: boolean): IrType {
  return walk.isVariant
    ? indexBy(extractVariantsWith(walk.type, name), name)
    : indexKeyword(walk.type, name, isLast);
}

function stepKeyword(walk: Walk, segment: string, isLast: boolean): Walk {
  switch (segment) {
    case "properties":
      return { ...walk, isName: true };
    case "items":
      return { ...walk, type: indexEntries(walk.type, "number") };
    case "additionalProperties":
      return { ...walk, type: indexEntries(walk.type, "string") };
    case "allOf":
      return { ...walk, isMemberIndex: true };
    case "anyOf":
    case "oneOf":
      return { ...walk, isMemberIndex: true, isVariant: true };
    default:
      return {
        ...walk,
        type: indexKeyword(walk.type, segment, isLast),
        isName: segment === DEFS_KEYWORD,
      };
  }
}

function stepInSchema(walk: Walk, segment: string, isLast: boolean): Walk {
  if (walk.isMemberIndex && INDEX_RE.test(segment)) {
    return { ...walk, isMemberIndex: false };
  }
  if (walk.isName) {
    return { ...walk, type: indexName(walk, segment, isLast), isName: false };
  }
  return stepKeyword({ ...walk, isMemberIndex: false }, segment, isLast);
}

/**
 * The type a schema `$ref` points to, for example `components["schemas"]["Foo"]["bar"]` for
 * `#/components/schemas/Foo/properties/bar`. A pointer without schema keywords gives the same type
 * as `refType`.
 *
 * Throws InvalidRefError when the `$ref` has no pointer.
 */
export function pointerType(ref: string): IrType {
  const [rootSegment, ...pointer] = parseRefPointer(ref);
  if (rootSegment === undefined) {
    throw new InvalidRefError(ref);
  }
  if (pointer.length <= 2) {
    return refType(ref);
  }
  let walk: Walk = {
    type: indexBy(rootType(rootSegment, false), ...pointer.slice(0, 2)),
    isSchema: rootSegment === "components" && pointer[0] === "schemas",
    isName: false,
    isVariant: false,
    isMemberIndex: false,
  };
  for (let index = 2; index < pointer.length; index++) {
    const segment = pointer[index] as string;
    const isLast = index === pointer.length - 1;
    if (walk.isSchema) {
      walk = stepInSchema(walk, segment, isLast);
    } else if (isSchemaKeyword(pointer, index, rootSegment)) {
      walk = { ...walk, isSchema: true };
    } else {
      walk = { ...walk, type: indexKeyword(walk.type, segment, isLast) };
    }
  }
  return walk.type;
}
