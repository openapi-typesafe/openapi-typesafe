import { performance } from "node:perf_hooks";
import * as changeCase from "change-case";
import ts from "typescript";
import {
  toPropertySignature,
  toStatement,
  toTypeNode,
} from "../adapters/type-ast-bridge/ir-to-typescript.js";
import {
  fromPropertySignature,
  fromTypeNode,
} from "../adapters/type-ast-bridge/typescript-to-ir.js";
import { type FooterSink, RunFooter } from "../application/transform/footer/document-footer.js";
import type {
  CustomType,
  SchemaCallbacks,
  SchemaLocation,
} from "../application/transform/schema/schema-context.js";
import { UNKNOWN_TYPE } from "../application/transform/shared-types.js";
import type {
  DocumentFooter,
  NameCasing,
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
import { injectOperation } from "./footer-helpers.js";
import { stringToAST, UNKNOWN } from "./ts.js";
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
    rootTypes: ctx.rootTypes,
    rootTypesNoSchemaPrefix: ctx.rootTypesNoSchemaPrefix,
    rootTypesKeepCasing: ctx.rootTypesKeepCasing,
    exportType: ctx.exportType,
    inject: ctx.inject,
    makePathsEnum: ctx.makePathsEnum,
  };
}

/** The legacy footer list as the sink of the run footer; user callbacks may add to it too. */
function footerSink(injectFooter: ts.Node[]): FooterSink {
  return {
    hasTypeAlias: (name) =>
      injectFooter.some((node) => ts.isTypeAliasDeclaration(node) && node.name.text === name),
    add: (declaration) => {
      injectFooter.push(toStatement(declaration));
    },
    addOperation: (build) => {
      injectOperation(injectFooter, () => toPropertySignature(build()));
    },
  };
}

/** One footer per run: it holds the enum registry, so it lives on the run's context. */
function runFooter(ctx: GlobalContext): DocumentFooter {
  ctx.runFooter ??= new RunFooter(footerSink(ctx.injectFooter), ctx.dedupeEnums);
  return ctx.runFooter;
}

/** Reads the text like the original: the expression of the first statement `stringToAST` parses. */
const TEMPLATES: TemplateLiteralParser = {
  parse(text) {
    const [statement] = stringToAST(text) as { expression?: ts.Node }[];
    const expression = statement?.expression;
    return expression ? fromTypeNode(expression as ts.TypeNode) : null;
  },
};

const CASING: NameCasing = { pascalCase: (text) => changeCase.pascalCase(text) };

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
    footer: runFooter(ctx),
    callbacks: callbacks(ctx),
    templates: TEMPLATES,
    diagnostics: DIAGNOSTICS,
    casing: CASING,
  };
}

/** The transformer's location for the original options object. */
export function schemaLocation(options: TransformNodeOptions): SchemaLocation {
  return { path: options.path, schema: options.schema };
}
