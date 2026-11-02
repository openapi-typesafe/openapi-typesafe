import type { Extensable, ExternalDocumentationObject, ReferenceObject } from "./openapi-common.js";

/**
 * [4.8.24] Schema Object
 * The Schema Object allows the definition of input and output data types. These types can be
 * objects, but also primitives and arrays. This object is a superset of the JSON Schema
 * Specification Draft 2020-12.
 */
export type SchemaObject = {
  /**
   * The Schema Object allows the definition of input and output data types. These types can be
   * objects, but also primitives and arrays. This object is a superset of the JSON Schema
   * Specification Draft 2020-12.
   */
  discriminator?: DiscriminatorObject;
  /**
   * MAY be used only on properties schemas. It has no effect on root schemas. Adds additional
   * metadata to describe the XML representation of this property.
   */
  xml?: XMLObject;
  /** Additional external documentation for this schema. */
  externalDocs?: ExternalDocumentationObject;
  /** @deprecated */
  example?: any;
  title?: string;
  description?: string;
  $comment?: string;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  enum?: unknown[];
  /**
   * Use of this keyword is functionally equivalent to an "enum" (Section 6.1.2) with a single
   * value.
   */
  const?: unknown;
  default?: unknown;
  format?: string;
  additionalProperties?: boolean | Record<string, never> | SchemaObject | ReferenceObject;
  /** @deprecated in 3.1 (still valid for 3.0) */
  nullable?: boolean;
  oneOf?: (SchemaObject | ReferenceObject)[];
  allOf?: (SchemaObject | ReferenceObject)[];
  anyOf?: (SchemaObject | ReferenceObject)[];
  required?: string[];
  [key: `x-${string}`]: any;
} & (
  | StringSubtype
  | NumberSubtype
  | IntegerSubtype
  | ArraySubtype
  | BooleanSubtype
  | NullSubtype
  | ObjectSubtype
  | {
      type: ("string" | "number" | "integer" | "array" | "boolean" | "null" | "object")[];
    }
);

export interface StringSubtype {
  type: "string" | ["string", "null"];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: (string | ReferenceObject)[];
}

export interface NumberSubtype {
  type: "number" | ["number", "null"];
  minimum?: number;
  maximum?: number;
  enum?: (number | ReferenceObject)[];
}

export interface IntegerSubtype {
  type: "integer" | ["integer", "null"];
  minimum?: number;
  maximum?: number;
  enum?: (number | ReferenceObject)[];
}

export interface ArraySubtype {
  type: "array" | ["array", "null"];
  prefixItems?: (SchemaObject | ReferenceObject)[];
  items?: SchemaObject | ReferenceObject | (SchemaObject | ReferenceObject)[];
  minItems?: number;
  maxItems?: number;
  enum?: (SchemaObject | ReferenceObject)[];
}

export interface BooleanSubtype {
  type: "boolean" | ["boolean", "null"];
  enum?: (boolean | ReferenceObject)[];
}

export interface NullSubtype {
  type: "null";
}

export interface ObjectSubtype {
  type: "object" | ["object", "null"];
  properties?: { [name: string]: SchemaObject | ReferenceObject };
  additionalProperties?: boolean | Record<string, never> | SchemaObject | ReferenceObject;
  patternProperties?: Record<string, SchemaObject | ReferenceObject>;
  required?: string[];
  allOf?: (SchemaObject | ReferenceObject)[];
  anyOf?: (SchemaObject | ReferenceObject)[];
  enum?: (SchemaObject | ReferenceObject)[];
  $defs?: $defs;
}

/**
 * [4.8.25] Discriminator Object
 * When request bodies or response payloads may be one of a number of different schemas, a
 * discriminator object can be used to aid in serialization, deserialization, and validation. The
 * discriminator is a specific object in a schema which is used to inform the consumer of the
 * document of an alternative schema based on the value associated with it.
 */
export interface DiscriminatorObject {
  /** REQUIRED. The name of the property in the payload that will hold the discriminator value. */
  propertyName: string;
  /** An object to hold mappings between payload values and schema names or references. */
  mapping?: Record<string, string>;
  /** If this exists, then a discriminator type should be added to objects matching this path */
  oneOf?: string[];
}

/**
 * [4.8.26] XML Object
 * A metadata object that allows for more fine-tuned XML model definitions. When using arrays, XML
 * element names are not inferred (for singular/plural forms) and the `name` property SHOULD be used
 * to add that information. See examples for expected behavior.
 */
export interface XMLObject extends Extensable {
  /**
   * Replaces the name of the element/attribute used for the described schema property. When defined
   * within `items`, it will affect the name of the individual XML elements within the list. When
   * defined alongside `type` being `array` (outside the `items`), it will affect the wrapping
   * element and only if `wrapped` is `true`. If `wrapped` is `false`, it will be ignored.
   */
  name?: string;
  /** The URI of the namespace definition. This MUST be in the form of an absolute URI. */
  namespace?: string;
  /** The prefix to be used for the name. */
  prefix?: string;
  /**
   * Declares whether the property definition translates to an attribute instead of an element.
   * Default value is `false`.
   */
  attribute?: boolean;
  /**
   * MAY be used only for an array definition. Signifies whether the array is wrapped (for example,
   * `<books><book/><book/></books>`) or unwrapped (`<book/><book/>`). Default value is `false`. The
   * definition takes effect only when defined alongside `type` being `array` (outside the `items`).
   */
  wrapped?: boolean;
}

/** The `$defs` of a Schema Object: named subschemas. */
export type $defs = Record<string, SchemaObject>;
