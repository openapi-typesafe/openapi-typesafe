import type { Extensable, ReferenceObject } from "./openapi-common.js";
import type { SchemaObject } from "./openapi-schema.js";

/**
 * [4.8.12] Parameter Object
 * Describes a single operation parameter.
 * A unique parameter is defined by a combination of a name and location.
 */
export interface ParameterObject extends Extensable {
  /**
   * REQUIRED. The name of the parameter. Parameter names are case sensitive.
   *
   * - If `in` is `"path"`, the `name` field MUST correspond to a template expression occurring
   * within the path field in the Paths Object. See Path Templating for further information.
   * - If `in` is `"header"` and the `name` field is `"Accept"`, `"Content-Type"` or
   * `"Authorization"`, the parameter definition SHALL be ignored.
   * - For all other cases, the `name` corresponds to the parameter name used by the `in` property.
   */
  name: string;
  /**
   * REQUIRED. The location of the parameter. Possible values are "query", "header", "path",
   * "cookie", or "querystring" (OpenAPI 3.2: the whole query string, described by `content`).
   */
  in: "query" | "header" | "path" | "cookie" | "querystring";
  /**
   * A brief description of the parameter. This could contain examples of use. CommonMark syntax MAY
   * be used for rich text representation.
   */
  description?: string;
  /**
   * Determines whether this parameter is mandatory. If the parameter location is "path", this
   * property is REQUIRED and its value MUST be true. Otherwise, the property MAY be included and
   * its default value is false.
   */
  required?: boolean;
  /**
   * Specifies that a parameter is deprecated and SHOULD be transitioned out of usage. Default value
   * is false.
   */
  deprecated?: boolean;
  /**
   * Sets the ability to pass empty-valued parameters. This is valid only for query parameters and
   * allows sending a parameter with an empty value. Default value is false. If style is used, and
   * if behavior is n/a (cannot be serialized), the value of allowEmptyValue SHALL be ignored. Use
   * of this property is NOT RECOMMENDED, as it is likely to be removed in a later revision.
   */
  allowEmptyValue?: boolean;
  /**
   * Describes how the parameter value will be serialized depending on the type of the parameter
   * value. Default values (based on value of in): for query - form; for path - simple; for header -
   * simple; for cookie - form.
   */
  style?: string;
  /**
   * When this is true, parameter values of type `array` or `object` generate separate parameters
   * for each value of the array or key-value pair of the map. For other types of parameters this
   * property has no effect. When `style` is `form`, the default value is `true`. For all other
   * styles, the default value is `false`.
   */
  explode?: boolean;
  /**
   * Determines whether the parameter value SHOULD allow reserved characters, as defined by
   * [RFC3986] `:/?#[]@!$&'()*+,;=` to be included without percent-encoding. This property only
   * applies to parameters with an `in` value of `query`. The default value is `false`.
   */
  allowReserved?: boolean;
  /** The schema defining the type used for the parameter. */
  schema?: SchemaObject;
  /** Example of the parameter’s potential value. */
  // biome-ignore lint/suspicious/noExplicitAny: public type under semver (ADR-034)
  example?: any;
  /** Examples of the parameter’s potential value. */
  examples?: { [name: string]: ExampleObject | ReferenceObject };
  /** A map containing the representations for the parameter. */
  content?: { [contentType: string]: MediaTypeObject | ReferenceObject };
}

/**
 * [4.8.13] Request Body Object
 * Describes a single request body.
 */
export interface RequestBodyObject extends Extensable {
  /**
   * A brief description of the request body. This could contain examples of use. CommonMark syntax
   * MAY be used for rich text representation.
   */
  description?: string;
  /**
   * REQUIRED. The content of the request body. The key is a media type or media type range and the
   * value describes it. For requests that match multiple keys, only the most specific key is
   * applicable. e.g. text/plain overrides text
   */
  content: { [contentType: string]: MediaTypeObject | ReferenceObject };
  /** Determines if the request body is required in the request. Defaults to false. */
  required?: boolean;
}

/**
 * [4.8.14] Media Type Object
 */
export interface MediaTypeObject extends Extensable {
  /** The schema defining the content of the request, response, or parameter. */
  schema?: SchemaObject | ReferenceObject;
  /**
   * The schema of each item of a sequential media type such as `application/jsonl` or
   * `text/event-stream` (OpenAPI 3.2).
   */
  itemSchema?: SchemaObject | ReferenceObject;
  /**
   * Example of the media type. The example object SHOULD be in the correct format as specified by
   * the media type. The example field is mutually exclusive of the examples field. Furthermore, if
   * referencing a schema which contains an example, the example value SHALL override the example
   * provided by the schema.
   */
  // biome-ignore lint/suspicious/noExplicitAny: public type under semver (ADR-034)
  example?: any;
  /**
   * Examples of the media type. Each example object SHOULD match the media type and specified
   * schema if present. The examples field is mutually exclusive of the example field. Furthermore,
   * if referencing a schema which contains an example, the examples value SHALL override the
   * example provided by the schema.
   */
  examples?: { [name: string]: ExampleObject | ReferenceObject };
  /**
   * A map between a property name and its encoding information. The key, being the property name,
   * MUST exist in the schema as a property. The encoding object SHALL only apply to requestBody
   * objects when the media type is multipart or application/x-www-form-urlencoded.
   */
  encoding?: { [propertyName: string]: EncodingObject };
}

/**
 * [4.8.15] Encoding Object
 * A single encoding definition applied to a single schema property.
 */
export interface EncodingObject extends Extensable {
  /**
   * The Content-Type for encoding a specific property. Default value depends on the property type:
   * for object - application/json; for array – the default is defined based on the inner type; for
   * all other cases the default is application/octet-stream. The value can be a specific media type
   * (e.g. application/json), a wildcard media type (e.g. image/*), or a comma-separated list of the
   * two types.
   */
  contentType?: string;
  /**
   * A map allowing additional information to be provided as headers, for example
   * Content-Disposition. Content-Type is described separately and SHALL be ignored in this section.
   * This property SHALL be ignored if the request body media type is not a multipart.
   */
  headers?: { [name: string]: HeaderObject | ReferenceObject };
  /**
   * Describes how a specific property value will be serialized depending on its type. See Parameter
   * Object for details on the style property. The behavior follows the same values as query
   * parameters, including default values. This property SHALL be ignored if the request body media
   * type is not application/x-www-form-urlencoded or multipart/form-data. If a value is explicitly
   * defined, then the value of contentType (implicit or explicit) SHALL be ignored.
   */
  style?: string;
  /**
   * When this is true, property values of type array or object generate separate parameters for
   * each value of the array, or key-value-pair of the map. For other types of properties this
   * property has no effect. When style is form, the default value is true. For all other styles,
   * the default value is false. This property SHALL be ignored if the request body media type is
   * not application/x-www-form-urlencoded or multipart/form-data. If a value is explicitly defined,
   * then the value of contentType (implicit or explicit) SHALL be ignored.
   */
  explode?: string;
  /**
   * Determines whether the parameter value SHOULD allow reserved characters, as defined by
   * [RFC3986] :/?#[]@!$&'()*+,;= to be included without percent-encoding. The default value is
   * false. This property SHALL be ignored if the request body media type is not
   * application/x-www-form-urlencoded or multipart/form-data. If a value is explicitly defined,
   * then the value of contentType (implicit or explicit) SHALL be ignored.
   */
  allowReserved?: string;
}

/**
 * [4.8.19[ Example Object
 */
export interface ExampleObject extends Extensable {
  /** Short description for the example. */
  summary?: string;
  /**
   * Long description for the example. CommonMark syntax MAY be used for rich text representation.
   */
  description?: string;
  /**
   * Embedded literal example. The value field and externalValue field are mutually exclusive. To
   * represent examples of media types that cannot naturally represented in JSON or YAML, use a
   * string value to contain the example, escaping where necessary.
   */
  // biome-ignore lint/suspicious/noExplicitAny: public type under semver (ADR-034)
  value?: any;
  /**
   * A URI that points to the literal example. This provides the capability to reference examples
   * that cannot easily be included in JSON or YAML documents. The value field and externalValue
   * field are mutually exclusive. See the rules for resolving Relative References.
   */
  externalValue?: string;
}

/**
 * [4.8.21] Header Object
 * The Header Object follows the structure of the Parameter Object with the following changes:
 *
 * 1. `name` MUST NOT be specified, it is given in the corresponding `headers` map.
 * 2. `in` MUST NOT be specified, it is implicitly in `header`.
 * 3. All traits that are affected by the location MUST be applicable to a location of `heade`r (for
 * example, `style`).
 */
export type HeaderObject = Omit<ParameterObject, "name" | "in">;
