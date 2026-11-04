import type { IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import type { OutputFix } from "../../../domain/output-fixes.js";

/**
 * Everything the schema transformer needs from outside, as explicit dependencies (ENGINEERING_PLAN
 * §4.4): options, `$ref` resolution, discriminators, declarations added to the file footer, and the
 * user callbacks. The transformer is pure given these; there is no module-level state.
 */

/** Generator options that change schema output. */
export interface SchemaOptions {
  readonly additionalProperties: boolean;
  readonly alphabetize: boolean;
  readonly arrayLength: boolean;
  /** `--binary-as-blob`: raw binary strings become `Blob`. */
  readonly binaryAsBlob: boolean;
  readonly conditionalEnums: boolean;
  readonly dedupeEnums: boolean;
  readonly defaultNonNullable: boolean;
  readonly emptyObjectsUnknown: boolean;
  readonly enum: boolean;
  readonly enumValues: boolean;
  readonly excludeDeprecated: boolean;
  /** `--fix`: the opt-in output fixes of this run (ADR-021). */
  readonly fixes: ReadonlySet<OutputFix>;
  readonly immutable: boolean;
  readonly propertiesRequiredByDefault: boolean;
  readonly readWriteMarkers: boolean;
}

/**
 * Where the transformer is in the document. `schema` is whatever the caller passed along; it is
 * only handed to user callbacks, as the original does.
 */
export interface SchemaLocation {
  readonly path?: string | undefined;
  readonly schema?: unknown;
}

/** A discriminator object, as far as the transformer reads it. */
export interface Discriminator {
  readonly propertyName: string;
  readonly mapping?: Readonly<Record<string, string>> | undefined;
}

/** The enum of a discriminator owner's property, and the location it is typed at. */
export interface DiscriminatorEnumParent {
  readonly schema: SchemaObject;
  readonly path: string;
}

export interface Discriminators {
  /** The discriminator that applies to the schema at this `$ref`, if any. */
  objectAt(ref: string): Discriminator | undefined;
  /** Whether the discriminator property of this `$ref` was already added. */
  isHandled(ref: string): boolean;
  /**
   * With `discriminator-values`: the owner's enum that a member's value narrows, found by
   * the enum schema the discriminator scan added or by the discriminator object of `objectAt`.
   */
  enumParentOf(schema: object): DiscriminatorEnumParent | undefined;
}

export interface RefResolver {
  resolve(ref: string): unknown;
}

/** `x-enum-varnames` / `x-enum-descriptions` entry of one enum value. */
export interface EnumMemberMetadata {
  readonly name: string | undefined;
  readonly description: string | undefined;
}

export interface EnumDeclarationRequest {
  readonly name: string;
  readonly values: readonly (string | number)[];
  readonly metadata: readonly EnumMemberMetadata[];
}

export interface EnumValuesRequest {
  readonly name: string;
  readonly type: IrType;
  readonly values: readonly (string | number)[];
}

/** Declarations the transformer adds once per file, after the main interfaces. */
export interface FooterDeclarations {
  /** Add (or reuse) an enum declaration and return the name it was declared with. */
  addEnum(request: EnumDeclarationRequest): string;
  /** The member names of the enum declared with this name, by value; empty for another name. */
  enumMembers(name: string): ReadonlyMap<string | number, string>;
  /** Add an exported, readonly array of enum values (`--enum-values`). */
  addEnumValues(request: EnumValuesRequest): void;
  /** Make sure the `WithRequired` helper type is declared. */
  requireWithRequired(): void;
  /** Make sure the `PropertyValues` helper type is declared (`unevaluated-properties`). */
  requirePropertyValues(): void;
}

/** A type returned by the `transform` callback; `isOptional` is its `questionToken`. */
export interface CustomType {
  readonly type: IrType;
  readonly isOptional: boolean;
}

/** User callbacks. A callback that is not set returns null. */
export interface SchemaCallbacks {
  transform(schema: unknown, location: SchemaLocation): CustomType | null;
  postTransform(type: IrType, location: SchemaLocation): IrType | null;
  transformProperty(
    property: IrPropertySignature,
    schema: unknown,
    location: SchemaLocation,
  ): IrPropertySignature | null;
}

export interface SchemaContext {
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
  readonly discriminators: Discriminators;
  readonly footer: FooterDeclarations;
  readonly callbacks: SchemaCallbacks;
}
