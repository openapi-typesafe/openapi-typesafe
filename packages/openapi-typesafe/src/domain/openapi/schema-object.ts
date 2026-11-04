/**
 * The parts of an OpenAPI / JSON Schema object that the schema transformer reads. Documents are
 * validated by the loader, so fields are typed as the specification defines them; places where the
 * original generator tolerates other input check the value at run time.
 */

export interface ReferenceSchema {
  readonly $ref: string;
}

/** A schema: an object, a reference, or a boolean schema (`true` allows anything). */
export type Schema = SchemaObject | ReferenceSchema | boolean;

export type SchemaTypeName =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "array"
  | "object";

export interface SchemaDiscriminator {
  /** Optional since OpenAPI 3.2; a discriminator without it adds no property type. */
  readonly propertyName?: string;
  readonly mapping?: Readonly<Record<string, string>>;
}

export interface SchemaObject {
  readonly type?: SchemaTypeName | readonly (SchemaTypeName | null)[];
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly nullable?: boolean;
  readonly format?: string;
  readonly contentMediaType?: string;
  readonly contentEncoding?: string;
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: Schema | Readonly<Record<string, never>>;
  readonly patternProperties?: Readonly<Record<string, Schema>>;
  readonly unevaluatedProperties?: Schema | Readonly<Record<string, never>>;
  readonly $defs?: Readonly<Record<string, SchemaObject>>;
  readonly items?: Schema | readonly Schema[];
  readonly prefixItems?: readonly Schema[];
  readonly unevaluatedItems?: Schema;
  readonly contains?: Schema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly allOf?: readonly Schema[];
  readonly anyOf?: readonly Schema[];
  readonly oneOf?: readonly Schema[];
  readonly discriminator?: SchemaDiscriminator;
  readonly readOnly?: boolean;
  readonly writeOnly?: boolean;
  readonly default?: unknown;
  readonly deprecated?: boolean;
  readonly "x-enum-varnames"?: readonly string[];
  readonly "x-enumNames"?: readonly string[];
  readonly "x-enum-descriptions"?: readonly string[];
  readonly "x-enumDescriptions"?: readonly string[];
}
