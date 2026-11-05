import type {
  CustomType,
  Discriminator,
  EnumDeclarationRequest,
  EnumValuesRequest,
  SchemaCallbacks,
  SchemaLocation,
} from "../../src/application/transform/schema/schema-context.js";
import type {
  DocumentFooter,
  NameCasing,
  TransformContext,
  TransformDiagnostics,
  TransformOptions,
} from "../../src/application/transform/transform-context.js";
import type { IrPropertySignature, IrType } from "../../src/domain/ir/nodes.js";

export const DEFAULT_TRANSFORM_OPTIONS: TransformOptions = {
  additionalProperties: false,
  alphabetize: false,
  arrayLength: false,
  binaryAsBlob: false,
  conditionalEnums: false,
  dedupeEnums: false,
  defaultNonNullable: true,
  emptyObjectsUnknown: false,
  enum: false,
  enumValues: false,
  excludeDeprecated: false,
  fixes: new Set(),
  immutable: false,
  propertiesRequiredByDefault: false,
  readWriteMarkers: false,
  generatePathParams: false,
  pathParamsAsTypes: false,
  rootTypes: false,
  rootTypesNoSchemaPrefix: false,
  rootTypesKeepCasing: false,
  exportType: false,
  inject: undefined,
  makePathsEnum: false,
};

/** Records footer requests; enum names are the requested names with a capital letter. */
export class RecordingFooter implements DocumentFooter {
  readonly enums: EnumDeclarationRequest[] = [];
  readonly enumValues: EnumValuesRequest[] = [];
  /** `operations` members, built when added (the order the real footer builds them in). */
  readonly operations: IrPropertySignature[] = [];
  withRequiredCount = 0;
  propertyValuesCount = 0;

  addEnum(request: EnumDeclarationRequest): string {
    this.enums.push(request);
    return this.addEnumName(request);
  }

  private addEnumName(request: EnumDeclarationRequest): string {
    const name = request.name.replaceAll("/", "");
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }

  /** Members are named by their values. */
  enumMembers(name: string): ReadonlyMap<string | number, string> {
    const request = this.enums.find((entry) => this.addEnumName(entry) === name);
    return new Map((request?.values ?? []).map((value) => [value, String(value)]));
  }

  addEnumValues(request: EnumValuesRequest): void {
    this.enumValues.push(request);
  }

  requireWithRequired(): void {
    this.withRequiredCount++;
  }

  requirePropertyValues(): void {
    this.propertyValuesCount++;
  }

  addOperation(build: () => IrPropertySignature): void {
    this.operations.push(build());
  }
}

/** A clock that advances 1 ms per reading, and the debug messages it was given. */
export class RecordingDiagnostics implements TransformDiagnostics {
  readonly messages: { readonly message: string; readonly durationMs: number }[] = [];
  #time = 0;

  now(): number {
    return this.#time++;
  }

  debug(message: string, durationMs: number): void {
    this.messages.push({ message, durationMs });
  }
}

/** Capitalizes the first letter only; the real casing is covered by the parity tests. */
const CAPITALIZING_CASING: NameCasing = {
  pascalCase: (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`,
};

/** Reads any text as a raw type; the real parser is covered by the parity tests. */

/** Callbacks given as plain functions; missing ones return null like unset user callbacks. */
export interface FakeCallbacks {
  readonly transform?: (schema: unknown, location: SchemaLocation) => CustomType | null;
  readonly postTransform?: (type: IrType, location: SchemaLocation) => IrType | null;
  readonly transformProperty?: (
    property: IrPropertySignature,
    schema: unknown,
    location: SchemaLocation,
  ) => IrPropertySignature | null;
}

function callbacksOf(fake: FakeCallbacks): SchemaCallbacks {
  return {
    transform: (schema, location) => fake.transform?.(schema, location) ?? null,
    postTransform: (type, location) => fake.postTransform?.(type, location) ?? null,
    transformProperty: (property, schema, location) =>
      fake.transformProperty?.(property, schema, location) ?? null,
  };
}

export interface FakeContextInput {
  readonly options?: Partial<TransformOptions>;
  readonly documents?: Readonly<Record<string, unknown>>;
  readonly discriminators?: Readonly<Record<string, Discriminator>>;
  readonly handledRefs?: readonly string[];
  readonly callbacks?: FakeCallbacks;
}

export function fakeTransformContext(input: FakeContextInput = {}): {
  context: TransformContext;
  footer: RecordingFooter;
  diagnostics: RecordingDiagnostics;
} {
  const footer = new RecordingFooter();
  const diagnostics = new RecordingDiagnostics();
  const context: TransformContext = {
    options: { ...DEFAULT_TRANSFORM_OPTIONS, ...input.options },
    refs: { resolve: (ref) => input.documents?.[ref] },
    discriminators: {
      objectAt: (ref) => input.discriminators?.[ref],
      isHandled: (ref) => input.handledRefs?.includes(ref) ?? false,
      otherPropertiesAt: () => [],
      enumParentOf: () => undefined,
    },
    footer,
    callbacks: callbacksOf(input.callbacks ?? {}),
    diagnostics,
    casing: CAPITALIZING_CASING,
  };
  return { context, footer, diagnostics };
}
