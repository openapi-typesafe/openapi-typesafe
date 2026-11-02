import type {
  CustomType,
  Discriminator,
  EnumDeclarationRequest,
  EnumValuesRequest,
  FooterDeclarations,
  SchemaCallbacks,
  SchemaContext,
  SchemaLocation,
  SchemaOptions,
} from "../../src/application/transform/schema/schema-context.js";
import type { IrPropertySignature, IrType } from "../../src/domain/ir/nodes.js";

export const DEFAULT_SCHEMA_OPTIONS: SchemaOptions = {
  additionalProperties: false,
  alphabetize: false,
  arrayLength: false,
  conditionalEnums: false,
  dedupeEnums: false,
  defaultNonNullable: true,
  emptyObjectsUnknown: false,
  enum: false,
  enumValues: false,
  excludeDeprecated: false,
  immutable: false,
  propertiesRequiredByDefault: false,
  readWriteMarkers: false,
};

/** Records footer requests; enum names are the requested names with a capital letter. */
export class RecordingFooter implements FooterDeclarations {
  readonly enums: EnumDeclarationRequest[] = [];
  readonly enumValues: EnumValuesRequest[] = [];
  withRequiredCount = 0;

  addEnum(request: EnumDeclarationRequest): string {
    this.enums.push(request);
    const name = request.name.replaceAll("/", "");
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  }

  addEnumValues(request: EnumValuesRequest): void {
    this.enumValues.push(request);
  }

  requireWithRequired(): void {
    this.withRequiredCount++;
  }
}

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
  readonly options?: Partial<SchemaOptions>;
  readonly documents?: Readonly<Record<string, unknown>>;
  readonly discriminators?: Readonly<Record<string, Discriminator>>;
  readonly handledRefs?: readonly string[];
  readonly callbacks?: FakeCallbacks;
}

export function fakeSchemaContext(input: FakeContextInput = {}): {
  context: SchemaContext;
  footer: RecordingFooter;
} {
  const footer = new RecordingFooter();
  const context: SchemaContext = {
    options: { ...DEFAULT_SCHEMA_OPTIONS, ...input.options },
    refs: { resolve: (ref) => input.documents?.[ref] },
    discriminators: {
      objectAt: (ref) => input.discriminators?.[ref],
      isHandled: (ref) => input.handledRefs?.includes(ref) ?? false,
    },
    footer,
    callbacks: callbacksOf(input.callbacks ?? {}),
  };
  return { context, footer };
}
