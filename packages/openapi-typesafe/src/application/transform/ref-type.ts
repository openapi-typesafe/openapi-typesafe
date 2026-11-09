import { ERROR_CODES, OpenAPITypesafeError } from "../../domain/errors.js";
import {
  irIndexedAccess,
  irKeyword,
  irObject,
  irProperty,
  irReference,
  irString,
} from "../../domain/ir/constructors.js";
import type { IrType } from "../../domain/ir/nodes.js";
import { toPropertyName } from "../../domain/ir/property-name.js";
import { parseRefPointer } from "../../domain/openapi/json-pointer.js";

/** Where a referenced parameter lives in the generated `parameters` type. */
export interface RefParameterTarget {
  readonly in: string;
  readonly name: string;
}

export interface RefTypeOptions {
  /** Wrap the root in `FlattenedDeepRequired<…>`. */
  readonly isDeep?: boolean;
  /** Segments to narrow with `Extract<T, { segment: unknown }>` before indexing. */
  readonly extractProperties?: readonly string[];
  /** Set when the `$ref` resolves to a parameter object: its last segment indexes `in`, `name`. */
  readonly parameter?: RefParameterTarget | null;
}

export class InvalidRefError extends OpenAPITypesafeError {
  constructor(ref: string) {
    super({
      code: ERROR_CODES.SCHEMA_REF_INVALID,
      message: `Error parsing $ref: ${ref}. Is this a valid $ref?`,
      details: { ref },
    });
    this.name = "InvalidRefError";
  }
}

/** Segments that index into the root type, always as escaped string literal types. */
export function indexBy(type: IrType, ...segments: readonly string[]): IrType {
  return segments.reduce<IrType>(
    (object, segment) => irIndexedAccess(object, irString(segment, "escaped")),
    type,
  );
}

/**
 * `Extract<T, { name: unknown }>`. The original wrote the name as an identifier even when it is
 * not one (`{ content-type: unknown }`), which is a syntax error; it is now quoted like any other
 * property name, and an identifier stays as it was.
 */
export function extractVariantsWith(type: IrType, propertyName: string): IrType {
  const probe = irProperty(toPropertyName(propertyName), irKeyword("unknown"));
  return irReference("Extract", [type, irObject([probe])]);
}

const DEFS_KEYWORD = "$defs";

/**
 * Index by `segment`. A `$defs` member is optional (it is a keyword, not data), so when more
 * segments follow it is wrapped in `NonNullable<…>` first; otherwise the next index fails on
 * `undefined` (upstream #2664).
 */
export function indexKeyword(type: IrType, segment: string, isLast: boolean): IrType {
  const indexed = indexBy(type, segment);
  return segment === DEFS_KEYWORD && !isLast ? irReference("NonNullable", [indexed]) : indexed;
}

export function rootType(rootSegment: string, isDeep: boolean): IrType {
  const root = irReference(rootSegment);
  return isDeep ? irReference("FlattenedDeepRequired", [root]) : root;
}

/**
 * The indexed-access type of a `$ref` into the generated types (the original `oapiRef`), for
 * example `components["schemas"]["Foo"]`. The first three segments index directly. After them,
 * `properties` segments are skipped (objects are flattened, upstream issue 1742), a parameter's
 * last segment becomes `[in][name]`, and listed segments are narrowed with `Extract` first.
 *
 * Throws InvalidRefError when the `$ref` has no pointer.
 */
export function refType(ref: string, options: RefTypeOptions = {}): IrType {
  const [rootSegment, ...pointer] = parseRefPointer(ref);
  if (rootSegment === undefined) {
    throw new InvalidRefError(ref);
  }
  const extracted = new Set(options.extractProperties ?? []);
  const lastIndex = pointer.length - 1;
  const leading = indexBy(rootType(rootSegment, options.isDeep ?? false), ...pointer.slice(0, 2));
  return pointer.slice(2).reduce<IrType>((type, segment, offset) => {
    if (segment === "properties") {
      return type;
    }
    if (options.parameter && offset + 2 === lastIndex) {
      return indexBy(type, options.parameter.in, options.parameter.name);
    }
    const isLast = offset + 2 === lastIndex;
    return extracted.has(segment)
      ? indexBy(extractVariantsWith(type, segment), segment)
      : indexKeyword(type, segment, isLast);
  }, leading);
}
