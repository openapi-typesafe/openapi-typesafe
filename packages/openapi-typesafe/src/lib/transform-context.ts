import { performance } from "node:perf_hooks";
import ts from "typescript";
import { toPropertySignature, toTypeNode } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import {
  fromPropertySignature,
  fromTypeNode,
} from "../adapters/type-ast-bridge/typescript-to-ir.js";
import type {
  CustomType,
  SchemaCallbacks,
  SchemaLocation,
} from "../application/transform/schema/schema-context.js";
import { UNKNOWN_TYPE } from "../application/transform/shared-types.js";
import type {
  DocumentFooter,
  TemplateLiteralParser,
  TransformContext,
  TransformDiagnostics,
  TransformOptions,
} from "../application/transform/transform-context.js";
import type { IrPropertySignature, IrType } from "../domain/ir/nodes.js";
import type {
  GlobalContext,
  SchemaObject,
  TransformNodeOptions,
  TransformObject,
} from "../types.js";
import { injectOperation, injectWithRequiredHelper } from "./footer-helpers.js";
import { stringToAST, tsArrayLiteralExpression, tsEnum, UNKNOWN } from "./ts.js";
import { debug } from "./utils.js";

/**
 * Temporary adapter (ENGINEERING_PLAN Phase 5): the ported transformers work on IR, while their
 * unported parents, the footer and the user callbacks still use `ts.Node`. This builds their
 * context from the original `GlobalContext`. It goes away when the parents are ported (Phase 5,
 * step 6).
 */

export class UnreadablePropertyError extends Error {
  constructor(path: string | undefined) {
    super(`transformProperty at ${path} returned a property with syntax the generator cannot read`);
    this.name = "UnreadablePropertyError";
  }
}

/** The original constant keeps its identity across the boundary (see `UNKNOWN_TYPE`). */
export function toLegacyType(type: IrType): ts.TypeNode {
  return type === UNKNOWN_TYPE ? UNKNOWN : toTypeNode(type);
}

export function fromLegacyType(node: ts.TypeNode): IrType {
  return node === UNKNOWN ? UNKNOWN_TYPE : fromTypeNode(node);
}

function transformOptions(ctx: GlobalContext): TransformOptions {
  return {
    additionalProperties: ctx.additionalProperties,
    alphabetize: ctx.alphabetize,
    arrayLength: ctx.arrayLength,
    conditionalEnums: ctx.conditionalEnums,
    dedupeEnums: ctx.dedupeEnums,
    defaultNonNullable: ctx.defaultNonNullable,
    emptyObjectsUnknown: ctx.emptyObjectsUnknown,
    enum: ctx.enum,
    enumValues: ctx.enumValues,
    excludeDeprecated: ctx.excludeDeprecated,
    immutable: ctx.immutable,
    propertiesRequiredByDefault: ctx.propertiesRequiredByDefault,
    readWriteMarkers: ctx.readWriteMarkers,
    generatePathParams: ctx.generatePathParams,
    pathParamsAsTypes: ctx.pathParamsAsTypes,
  };
}

function footer(ctx: GlobalContext): DocumentFooter {
  return {
    addEnum({ name, values, metadata }) {
      const declaration = tsEnum(name, [...values], [...metadata], {
        shouldCache: ctx.dedupeEnums,
        export: true,
      });
      // With --dedupe-enums the cache returns a declaration that may be in the footer already.
      if (!ctx.injectFooter.includes(declaration)) {
        ctx.injectFooter.push(declaration);
      }
      return ts.idText(declaration.name);
    },
    addEnumValues({ name, type, values }) {
      const options = { export: true, readonly: true, injectFooter: ctx.injectFooter };
      ctx.injectFooter.push(
        tsArrayLiteralExpression(name, toLegacyType(type), [...values], options),
      );
    },
    requireWithRequired() {
      injectWithRequiredHelper(ctx.injectFooter);
    },
    addOperation(build) {
      injectOperation(ctx.injectFooter, () => toPropertySignature(build()));
    },
  };
}

/** Reads the text like the original: the expression of the first statement `stringToAST` parses. */
const TEMPLATES: TemplateLiteralParser = {
  parse(text) {
    const [statement] = stringToAST(text) as { expression?: ts.Node }[];
    const expression = statement?.expression;
    return expression ? fromTypeNode(expression as ts.TypeNode) : null;
  },
};

/** `performance.now()` and the original `debug` logger, in the "ts" group. */
const DIAGNOSTICS: TransformDiagnostics = {
  now: () => performance.now(),
  debug: (message, durationMs) => debug(message, "ts", durationMs),
};

function nodeOptions(ctx: GlobalContext, location: SchemaLocation): TransformNodeOptions {
  return { ...location, ctx } as TransformNodeOptions;
}

function customType(result: ts.TypeNode | TransformObject | undefined): CustomType | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  if ("schema" in result) {
    return { type: fromLegacyType(result.schema), isOptional: Boolean(result.questionToken) };
  }
  return { type: fromLegacyType(result), isOptional: false };
}

function callbacks(ctx: GlobalContext): SchemaCallbacks {
  return {
    transform(schema, location) {
      const transform = ctx.transform;
      return typeof transform === "function"
        ? customType(transform(schema as SchemaObject, nodeOptions(ctx, location)))
        : null;
    },
    postTransform(type, location) {
      const postTransform = ctx.postTransform;
      const result =
        typeof postTransform === "function"
          ? postTransform(toLegacyType(type), nodeOptions(ctx, location))
          : undefined;
      return result ? fromLegacyType(result) : null;
    },
    transformProperty(property, schema, location) {
      return transformPropertyWith(ctx, property, schema, location);
    },
  };
}

function transformPropertyWith(
  ctx: GlobalContext,
  property: IrPropertySignature,
  schema: unknown,
  location: SchemaLocation,
): IrPropertySignature | null {
  const transformProperty = ctx.transformProperty;
  if (typeof transformProperty !== "function") {
    return null;
  }
  const options = nodeOptions(ctx, location);
  const result = transformProperty(toPropertySignature(property), schema as SchemaObject, options);
  if (!result) {
    return null;
  }
  const converted = fromPropertySignature(result);
  if (converted === null) {
    throw new UnreadablePropertyError(location.path);
  }
  return converted;
}

/** The ported transformers' context for one call from a legacy transformer. */
export function createTransformContext(ctx: GlobalContext): TransformContext {
  return {
    options: transformOptions(ctx),
    refs: { resolve: (ref) => ctx.resolve(ref) },
    discriminators: {
      objectAt: (ref) => ctx.discriminators.objects[ref],
      isHandled: (ref) => ctx.discriminators.refsHandled.includes(ref),
    },
    footer: footer(ctx),
    callbacks: callbacks(ctx),
    templates: TEMPLATES,
    diagnostics: DIAGNOSTICS,
  };
}

/** The transformer's location for the original options object. */
export function schemaLocation(options: TransformNodeOptions): SchemaLocation {
  return { path: options.path, schema: options.schema };
}
