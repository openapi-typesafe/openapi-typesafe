import type { PathLike } from "node:fs";
import type { Readable } from "node:stream";
import type { Config as RedoclyConfig } from "@redocly/openapi-core";
import type { ts } from "../adapters/type-ast-bridge/typescript-types.js";
import type { FooterEntry } from "../api/footer-entry.js";
import type { Logger } from "../application/ports/logger.js";
import type { DocumentFooter } from "../application/transform/transform-context.js";
import type { IrPropertySignature, IrType } from "../domain/ir/nodes.js";
import type { OutputFix, OutputFixName } from "../domain/output-fixes.js";
import type { ReferenceObject } from "./openapi-common.js";
import type { OpenAPI3 } from "./openapi-document.js";
import type { DiscriminatorObject, SchemaObject } from "./openapi-schema.js";

export interface TransformObject {
  /** The type: an IR type (from the helpers), or a TypeScript node (read by the bridge). */
  schema: IrType | ts.TypeNode;
  questionToken: boolean;
}

/**
 * Every source type `openapiTS` accepts: YAML or JSON text, a URL, a parsed document, bytes or a
 * stream.
 */
export type SchemaSource = string | URL | OpenAPI3 | Buffer | Readable;

/** The generator options other than the schema callbacks. */
export interface OpenAPITSBaseOptions {
  /** Treat all objects as if they have `additionalProperties: true` by default (default: false) */
  additionalProperties?: boolean;
  /** Alphabetize all keys? (default: false) */
  alphabetize?: boolean;
  /** (optional) Generate tuples using array minItems / maxItems */
  arrayLength?: boolean;
  /**
   * Type raw binary strings as `Blob` instead of `string` (default: false): `format: binary`
   * (OpenAPI 3.0), or a `contentMediaType` that is not text and has no `contentEncoding` (3.1).
   * `Blob` is a global type of the DOM lib and `@types/node`.
   */
  binaryAsBlob?: boolean;
  /**
   * Allow schema objects with no specified properties to have additional properties if not
   * expressly forbidden? (default: false)
   */
  emptyObjectsUnknown?: boolean;
  /** Provide current working directory (cwd) which helps resolve relative remote schemas */
  cwd?: PathLike;
  /**
   * Load local `$ref` files only from this directory and below it; a relative path resolves
   * against `cwd`. Default: no limit. Threat model R1, ADR-017.
   */
  localRefRoot?: string | URL;
  /**
   * Load remote `$ref` documents only from these hosts (`name` or `name:port`); `[]` loads none.
   * Redirects are checked too. Default: any host. Threat model R2, ADR-017.
   */
  remoteRefHosts?: readonly string[];
  /** Should schema objects with a default value not be considered optional? */
  defaultNonNullable?: boolean;
  /** Exclude deprecated fields from types? (default: false) */
  excludeDeprecated?: boolean;
  /**
   * Opt-in fixes of the output of valid schemas (default: none), ADR-021. `"all"` turns on every
   * fix of the installed version, so a minor update can change the output; list the names to keep
   * it stable. An unknown name fails with `OPTION_FIX_UNKNOWN`.
   * @see https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/cli.md#fix
   */
  fix?: readonly OutputFixName[];
  /** Add readonly properties and readonly arrays? (default: false) */
  immutable?: boolean;
  /**
   * Lint the document with the Redocly config before generating (default: true). Bundling errors
   * still fail the run.
   */
  lint?: boolean;
  /** (optional) Should logging be suppressed? (necessary for STDOUT) */
  silent?: boolean;
  /** (optional) OpenAPI version. Must be present if parsing raw schema */
  version?: number;
  /** (optional) Export type instead of interface */
  exportType?: boolean;
  /** Export true TypeScript enums instead of unions */
  enum?: boolean;
  /** Export union values as arrays */
  enumValues?: boolean;
  /** Only generate TS Enums when `x-enum-*` metadata is available */
  conditionalEnums?: boolean;
  /** Dedupe enum values */
  dedupeEnums?: boolean;
  /** (optional) Substitute path parameter names with their respective types */
  pathParamsAsTypes?: boolean;
  /**
   * Treat all objects as if they have \`required\` set to all properties by default (default:
   * false)
   */
  propertiesRequiredByDefault?: boolean;
  /** (optional) Generate schema types at root level */
  rootTypes?: boolean;
  /** (optional) Do not add Schema prefix to types at root level */
  rootTypesNoSchemaPrefix?: boolean;
  /** (optional) Keep casing of root types */
  rootTypesKeepCasing?: boolean;
  /**
   * Configure Redocly for validation, schema fetching, and bundling
   * @see https://redocly.com/docs/cli/configuration/
   */
  redocly?: RedoclyConfig;
  /** Inject arbitrary TypeScript types into the start of the file */
  inject?: string;
  /** Generate ApiPaths enum */
  makePathsEnum?: boolean;
  /** Generate path params based on path even if they are not defined in the open api schema */
  generatePathParams?: boolean;
  /** Generate $Read/$Write markers for readOnly/writeOnly properties (default: false) */
  readWriteMarkers?: boolean;
}

/**
 * The schema callbacks of the original API: they receive TypeScript nodes (ADR-004, decisions 5
 * and 6). Results may be IR (from the helpers) or TypeScript nodes, read by the bridge.
 */
export interface LegacyCallbackOptions {
  /** Unset or false: the callbacks below receive TypeScript nodes. */
  irCallbacks?: false;
  /** Manually transform certain Schema Objects with a custom TypeScript type */
  transform?: (
    schemaObject: SchemaObject,
    options: TransformNodeOptions,
  ) => IrType | ts.TypeNode | TransformObject | undefined;
  /**
   * Modify TypeScript types built from Schema Objects (receives a TypeScript node)
   * @deprecated Use `irCallbacks: true` (ADR-004, decision 6); the TypeScript form is removed in
   * 2.0.
   */
  postTransform?: (
    type: ts.TypeNode,
    options: TransformNodeOptions,
  ) => IrType | ts.TypeNode | undefined;
  /**
   * Modify property signatures for Schema Object properties (receives a TypeScript node)
   * @deprecated Use `irCallbacks: true` (ADR-004, decision 6); the TypeScript form is removed in
   * 2.0.
   */
  transformProperty?: (
    property: ts.PropertySignature,
    schemaObject: SchemaObject,
    options: TransformNodeOptions,
  ) => IrPropertySignature | ts.PropertySignature | undefined;
}

/**
 * The schema callbacks that have a deprecated TypeScript-node form (ADR-004, decisions 5 and 6).
 */
export type LegacyCallbackName = "transform" | "postTransform" | "transformProperty";

/** A type an IR callback returns: an IR type, or TypeScript type text printed as written. */
export type IrCallbackType = IrType | string;

/** What an IR `transform` callback returns to make the property optional. */
export interface IrTransformObject {
  schema: IrCallbackType;
  questionToken: boolean;
}

/** Replace the generated type of a Schema Object; `undefined` keeps the generated type. */
export type IrTransform = (
  schemaObject: SchemaObject,
  options: TransformNodeOptions,
) => IrCallbackType | IrTransformObject | undefined;

/** Modify the generated type of a Schema Object; `undefined` keeps it. */
export type IrPostTransform = (
  type: IrType,
  options: TransformNodeOptions,
) => IrCallbackType | undefined;

/** Modify the generated property of a Schema Object property; `undefined` keeps it. */
export type IrTransformProperty = (
  property: IrPropertySignature,
  schemaObject: SchemaObject,
  options: TransformNodeOptions,
) => IrPropertySignature | undefined;

/** The schema callbacks on IR (ENGINEERING_PLAN 6.3): they receive and return IR nodes. */
export interface IrCallbackOptions {
  irCallbacks: true;
  transform?: IrTransform;
  postTransform?: IrPostTransform;
  transformProperty?: IrTransformProperty;
}

/** The options of the original API: callbacks on TypeScript nodes. */
export interface OpenAPITSOptions extends OpenAPITSBaseOptions, LegacyCallbackOptions {}

/** The options with `irCallbacks: true`: callbacks on IR nodes. */
export interface OpenAPITSIrOptions extends OpenAPITSBaseOptions, IrCallbackOptions {}

/** Either form of the generator options. */
export type GeneratorOptions = OpenAPITSOptions | OpenAPITSIrOptions;

/** Context passed to all submodules */
export interface GlobalContext {
  // user options
  additionalProperties: boolean;
  alphabetize: boolean;
  arrayLength: boolean;
  binaryAsBlob: boolean;
  defaultNonNullable: boolean;
  discriminators: {
    objects: Record<string, DiscriminatorObject>;
    refsHandled: string[];
    /**
     * @internal With the `discriminator-enum-members` fix: for each enum the scan added to a
     * member, the enum of the owner's property and the location it is typed at.
     */
    enumParents?: ReadonlyMap<object, { readonly schema: SchemaObject; readonly path: string }>;
  };
  emptyObjectsUnknown: boolean;
  enum: boolean;
  enumValues: boolean;
  conditionalEnums: boolean;
  dedupeEnums: boolean;
  excludeDeprecated: boolean;
  exportType: boolean;
  /** The opt-in output fixes of this run, `all` expanded (ADR-021). Unset: none. */
  fix?: readonly OutputFix[];
  immutable: boolean;
  /**
   * Declarations written after the main types, in order. The generator adds IR declarations;
   * callbacks may add IR declarations or TypeScript nodes.
   */
  injectFooter: FooterEntry[];
  /**
   * @internal Footer state of this run (enum registry and enum naming), created on first use by
   * the transform context adapter. Not an option; do not set it.
   */
  runFooter?: DocumentFooter;
  /**
   * @internal The deprecated callback forms this run has warned about (once each). Not an
   * option; do not set it.
   */
  legacyCallbackWarnings?: Set<LegacyCallbackName>;
  /**
   * @internal Where this run reports warnings and debug output. Not an option; a context without
   * it logs to the terminal.
   */
  logger?: Logger;
  pathParamsAsTypes: boolean;
  /** Whether the callbacks below take IR (`OpenAPITSIrOptions`) or TypeScript nodes. */
  irCallbacks: boolean;
  postTransform: GeneratorOptions["postTransform"];
  propertiesRequiredByDefault: boolean;
  rootTypes: boolean;
  rootTypesNoSchemaPrefix: boolean;
  rootTypesKeepCasing: boolean;
  redoc: RedoclyConfig;
  silent: boolean;
  transform: GeneratorOptions["transform"];
  transformProperty: GeneratorOptions["transformProperty"];
  /** retrieve a node by $ref */
  resolve<T>($ref: string): T | undefined;
  inject?: string;
  makePathsEnum: boolean;
  generatePathParams: boolean;
  readWriteMarkers: boolean;
}

/** generic options for most internal transform* functions */
export interface TransformNodeOptions {
  path?: string;
  schema?: SchemaObject | ReferenceObject;
  ctx: GlobalContext;
}
