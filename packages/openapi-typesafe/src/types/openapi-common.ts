// Many types allow for true “any” for inheritance to work

// Note: these OpenAPI types are meant only for internal use, not external
// consumption. Some formatting may be better in other libraries meant for
// consumption. Some typing may be “loose” or “incorrect” in order to guarantee
// that all logical paths are handled. In other words, these are built more
// for ways schemas _can_ be written, not necessarily how they _should_ be.

export interface Extensable {
  [key: `x-${string}`]: any;
}

// Note: these OpenAPI types are meant only for internal use, not external
// consumption. Some formatting may be better in other libraries meant for
// consumption. Some typing may be “loose” or “incorrect” in order to guarantee
// that all logical paths are handled. In other words, these are built more
// for ways schemas _can_ be written, not necessarily how they _should_ be.

/**
 * [4.8.5] Server Object
 * An object representing a Server.
 */
export interface ServerObject extends Extensable {
  /**
   * REQUIRED. A URL to the target host. This URL supports Server Variables and MAY be relative, to
   * indicate that the host location is relative to the location where the OpenAPI document is being
   * served. Variable substitutions will be made when a variable is named in {brackets}.
   */
  url: string;
  /**
   * An optional string describing the host designated by the URL. CommonMark syntax MAY be used for
   * rich text representation.
   */
  description: string;
  /**
   * A map between a variable name and its value. The value is used for substitution in the server’s
   * URL template.
   */
  variables: { [name: string]: ServerVariableObject };
}

/**
 * [4.8.6] Server Variable Object
 * An object representing a Server Variable for server URL template substitution.
 */
export interface ServerVariableObject extends Extensable {
  /**
   * An enumeration of string values to be used if the substitution options are from a limited set.
   * The array MUST NOT be empty.
   */
  enum?: string[];
  /**
   * REQUIRED. The default value to use for substitution, which SHALL be sent if an alternate value
   * is not supplied. Note this behavior is different than the Schema Object’s treatment of default
   * values, because in those cases parameter values are optional. If the enum is defined, the value
   * MUST exist in the enum’s values.
   */
  default: string;
  /**
   * An optional description for the server variable. CommonMark syntax MAY be used for rich text
   * representation.
   */
  description?: string;
}

/**
 * [4.8.11] External Documentation Object
 * Allows referencing an external resource for extended documentation.
 */
export interface ExternalDocumentationObject extends Extensable {
  /**
   * A description of the target documentation. CommonMark syntax MAY be used for rich text
   * representation.
   */
  description?: string;
  /** REQUIRED. The URL for the target documentation. This MUST be in the form of a URL. */
  url: string;
}

/**
 * [4.8.23] Reference Object
 * A simple object to allow referencing other components in the OpenAPI document, internally and
 * externally. The $ref string value contains a URI [RFC3986], which identifies the location of the
 * value being referenced. See the rules for resolving Relative References.
 */
export interface ReferenceObject extends Extensable {
  /** REQUIRED. The reference identifier. This MUST be in the form of a URI. */
  $ref: string;
  /**
   * A short summary which by default SHOULD override that of the referenced component. If the
   * referenced object-type does not allow a summary field, then this field has no effect.
   */
  summary?: string;
  /**
   * A description which by default SHOULD override that of the referenced component. CommonMark
   * syntax MAY be used for rich text representation. If the referenced object-type does not allow a
   * description field, then this field has no effect.
   */
  description?: string;
}
