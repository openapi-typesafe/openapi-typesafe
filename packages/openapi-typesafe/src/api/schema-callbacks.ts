import { toPropertySignature, toTypeNode } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import { loadTypeScript } from "../adapters/type-ast-bridge/load-typescript.js";
import { fromPropertySignature } from "../adapters/type-ast-bridge/typescript-to-ir.js";
import type { ts } from "../adapters/type-ast-bridge/typescript-types.js";
import type {
  CustomType,
  SchemaCallbacks,
  SchemaLocation,
} from "../application/transform/schema/schema-context.js";
import { ERROR_CODES, OpenAPITypesafeError } from "../domain/errors.js";
import { irRaw } from "../domain/ir/constructors.js";
import type { IrPropertySignature, IrType } from "../domain/ir/nodes.js";
import type {
  GlobalContext,
  IrCallbackType,
  IrPostTransform,
  IrTransform,
  IrTransformProperty,
  LegacyCallbackOptions,
  SchemaObject,
  TransformNodeOptions,
} from "../types.js";
import { warnLegacyCallback } from "./legacy-callback-warning.js";
import { toIrType } from "./type-helpers.js";

/**
 * The user's schema callbacks as the transformers call them (ENGINEERING_PLAN 6.3, ADR-004).
 * With `irCallbacks: true` they receive and return IR; otherwise they receive TypeScript nodes and
 * their results are read by the bridge.
 */

export class UnreadablePropertyError extends OpenAPITypesafeError {
  constructor(path: string | undefined) {
    super({
      code: ERROR_CODES.CALLBACK_RESULT_UNREADABLE,
      message:
        `transformProperty at ${path} returned a property ` +
        "with syntax the generator cannot read",
      details: { callback: "transformProperty", path },
    });
    this.name = "UnreadablePropertyError";
  }
}

/** A `transform` or `postTransform` result that is neither IR nor a TypeScript node. */
export class UnreadableTypeError extends OpenAPITypesafeError {
  constructor(callback: "transform" | "postTransform", path: string | undefined) {
    super({
      code: ERROR_CODES.CALLBACK_RESULT_UNREADABLE,
      message: `${callback} at ${path} returned a value that is not a TypeScript node`,
      details: { callback, path },
    });
    this.name = "UnreadableTypeError";
  }
}

function nodeOptions(ctx: GlobalContext, location: SchemaLocation): TransformNodeOptions {
  return { ...location, ctx } as TransformNodeOptions;
}

/** The callbacks of the run: IR callbacks when the run asks for them, legacy ones otherwise. */
export function schemaCallbacks(ctx: GlobalContext): SchemaCallbacks {
  return ctx.irCallbacks ? irSchemaCallbacks(ctx) : legacySchemaCallbacks(ctx);
}

/** An IR callback type; text is a raw type, printed as written. */
function fromCallbackType(type: IrCallbackType): IrType {
  return typeof type === "string" ? irRaw(type) : type;
}

function irCustomType(result: ReturnType<IrTransform>): CustomType | null {
  if (result === undefined || result === null) {
    return null;
  }
  if (typeof result === "object" && "schema" in result) {
    return { type: fromCallbackType(result.schema), isOptional: Boolean(result.questionToken) };
  }
  return { type: fromCallbackType(result), isOptional: false };
}

/**
 * The context fields hold either callback form; `irCallbacks` says which one, so the casts below
 * only name the form the user declared with `OpenAPITSIrOptions`.
 */
function irSchemaCallbacks(ctx: GlobalContext): SchemaCallbacks {
  const transform = ctx.transform as IrTransform | undefined;
  const postTransform = ctx.postTransform as IrPostTransform | undefined;
  const transformProperty = ctx.transformProperty as IrTransformProperty | undefined;
  return {
    transform: (schema, location) =>
      transform
        ? irCustomType(transform(schema as SchemaObject, nodeOptions(ctx, location)))
        : null,
    postTransform(type, location) {
      const result = postTransform?.(type, nodeOptions(ctx, location));
      return result === undefined ? null : fromCallbackType(result);
    },
    transformProperty: (property, schema, location) =>
      transformProperty?.(property, schema as SchemaObject, nodeOptions(ctx, location)) ?? null,
  };
}

type LegacyTransform = NonNullable<LegacyCallbackOptions["transform"]>;
type LegacyPostTransform = NonNullable<LegacyCallbackOptions["postTransform"]>;
type LegacyTransformProperty = NonNullable<LegacyCallbackOptions["transformProperty"]>;

/** A legacy result type: IR from the helpers as it is; a TypeScript node through the bridge. */
/**
 * IR nodes have a string `kind`, TypeScript nodes a number. JavaScript callers can return any
 * value, and anything else would crash the TypeScript printer later.
 */
function readResultType(
  callback: "transform" | "postTransform",
  result: unknown,
  location: SchemaLocation,
): IrType {
  const kind = (result as { kind?: unknown }).kind;
  if (typeof kind !== "string" && typeof kind !== "number") {
    throw new UnreadableTypeError(callback, location.path);
  }
  return toIrType(result as IrType | ts.TypeNode);
}

function legacyResultType(ctx: GlobalContext, type: unknown, location: SchemaLocation): IrType {
  const result = readResultType("transform", type, location);
  if (typeof (type as { kind: unknown }).kind !== "string") {
    warnLegacyCallback(ctx, "transform");
  }
  return result;
}

function legacyCustomType(
  ctx: GlobalContext,
  result: ReturnType<LegacyTransform>,
  location: SchemaLocation,
): CustomType | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  if ("schema" in result) {
    return {
      type: legacyResultType(ctx, result.schema, location),
      isOptional: Boolean(result.questionToken),
    };
  }
  return { type: legacyResultType(ctx, result, location), isOptional: false };
}

/** See `irSchemaCallbacks` for the casts; `typeof` checks keep the original's tolerance. */
function legacySchemaCallbacks(ctx: GlobalContext): SchemaCallbacks {
  const transform = ctx.transform as LegacyTransform | undefined;
  const postTransform = ctx.postTransform as LegacyPostTransform | undefined;
  return {
    transform: (schema, location) =>
      typeof transform === "function"
        ? legacyCustomType(
            ctx,
            transform(schema as SchemaObject, nodeOptions(ctx, location)),
            location,
          )
        : null,
    postTransform(type, location) {
      if (typeof postTransform !== "function") {
        return null;
      }
      warnLegacyCallback(ctx, "postTransform");
      const result = postTransform(toTypeNode(loadTypeScript(), type), nodeOptions(ctx, location));
      return result ? readResultType("postTransform", result, location) : null;
    },
    transformProperty: (property, schema, location) =>
      legacyTransformProperty(ctx, property, schema, location),
  };
}

function isIrProperty(
  property: IrPropertySignature | ts.PropertySignature,
): property is IrPropertySignature {
  return typeof property.kind === "string";
}

function legacyTransformProperty(
  ctx: GlobalContext,
  property: IrPropertySignature,
  schema: unknown,
  location: SchemaLocation,
): IrPropertySignature | null {
  const transformProperty = ctx.transformProperty as LegacyTransformProperty | undefined;
  if (typeof transformProperty !== "function") {
    return null;
  }
  warnLegacyCallback(ctx, "transformProperty");
  const ts = loadTypeScript();
  const options = nodeOptions(ctx, location);
  const result = transformProperty(
    toPropertySignature(ts, property),
    schema as SchemaObject,
    options,
  );
  if (!result) {
    return null;
  }
  if (isIrProperty(result)) {
    return result;
  }
  // JavaScript callers can return any value, so check the node kind before reading it.
  const converted = ts.isPropertySignature(result) ? fromPropertySignature(ts, result) : null;
  if (converted === null) {
    throw new UnreadablePropertyError(location.path);
  }
  return converted;
}
