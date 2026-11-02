import type { Extensable, ReferenceObject, ServerObject } from "./openapi-common.js";
import type { HeaderObject, MediaTypeObject } from "./openapi-request.js";

/**
 * [4.8.16] Responses Object
 * A container for the expected responses of an operation. The container maps a HTTP response code
 * to the expected response.
 */
export type ResponsesObject = {
  [responseCode: string]: ResponseObject | ReferenceObject;
} & {
  /**
   * The documentation of responses other than the ones declared for specific HTTP response codes.
   * Use this field to cover undeclared responses.
   */
  default?: ResponseObject | ReferenceObject;
};

/**
 * [4.8.17] Response Object
 * Describes a single response from an API Operation, including design-time, static links to
 * operations based on the response.
 */
export interface ResponseObject extends Extensable {
  /**
   * REQUIRED. A description of the response. CommonMark syntax MAY be used for rich text
   * representation.
   */
  description: string;
  /**
   * Maps a header name to its definition. [RFC7230] states header names are case insensitive. If a
   * response header is defined with the name "Content-Type", it SHALL be ignored.
   */
  headers?: { [name: string]: HeaderObject | ReferenceObject };
  /**
   * A map containing descriptions of potential response payloads. The key is a media type or media
   * type range and the value describes it. For responses that match multiple keys, only the most
   * specific key is applicable. e.g. text/plain overrides text
   */
  content?: { [contentType: string]: MediaTypeObject };
  /**
   * A map of operations links that can be followed from the response. The key of the map is a short
   * name for the link, following the naming constraints of the names for Component Objects.
   */
  links?: { [name: string]: LinkObject | ReferenceObject };
}

/**
 * [4.8.20] Link Object
 * The Link object represents a possible design-time link for a response. The presence of a link
 * does not guarantee the caller’s ability to successfully invoke it, rather it provides a known
 * relationship and traversal mechanism between responses and other operations.
 */
export interface LinkObject extends Extensable {
  /**
   * A relative or absolute URI reference to an OAS operation. This field is mutually exclusive of
   * the operationId field, and MUST point to an Operation Object. Relative operationRef values MAY
   * be used to locate an existing Operation Object in the OpenAPI definition. See the rules for
   * resolving Relative References.
   */
  operationRef?: string;
  /**
   * The name of an existing, resolvable OAS operation, as defined with a unique operationId. This
   * field is mutually exclusive of the operationRef field.
   */
  operationId?: string;
  /**
   * A map representing parameters to pass to an operation as specified with operationId or
   * identified via operationRef. The key is the parameter name to be used, whereas the value can be
   * a constant or an expression to be evaluated and passed to the linked operation. The parameter
   * name can be qualified using the parameter location [{in}.]{name} for operations that use the
   * same parameter name in different locations (e.g. path.id).
   */
  parameters?: { [name: string]: `$${string}` };
  /** A literal value or {expression} to use as a request body when calling the target operation. */
  requestBody?: `$${string}`;
  /** A description of the link. CommonMark syntax MAY be used for rich text representation. */
  description?: string;
  /** A server object to be used by the target operation. */
  server?: ServerObject;
}
