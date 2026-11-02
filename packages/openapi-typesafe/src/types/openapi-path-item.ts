import type {
  Extensable,
  ExternalDocumentationObject,
  ReferenceObject,
  ServerObject,
} from "./openapi-common.js";
import type { ParameterObject, RequestBodyObject } from "./openapi-request.js";
import type { ResponsesObject } from "./openapi-response.js";
import type { SecurityRequirementObject } from "./openapi-security.js";

/**
 * [4.8.9] Path Item Object
 * Describes the operations available on a single path. A Path Item MAY be empty, due to ACL
 * constraints. The path itself is still exposed to the documentation viewer but they will not know
 * which operations and parameters are available.
 */
export interface PathItemObject extends Extensable {
  /** A definition of a GET operation on this path. */
  get?: OperationObject | ReferenceObject;
  /** A definition of a PUT operation on this path. */
  put?: OperationObject | ReferenceObject;
  /** A definition of a POST operation on this path. */
  post?: OperationObject | ReferenceObject;
  /** A definition of a DELETE operation on this path. */
  delete?: OperationObject | ReferenceObject;
  /** A definition of a OPTIONS operation on this path. */
  options?: OperationObject | ReferenceObject;
  /** A definition of a HEAD operation on this path. */
  head?: OperationObject | ReferenceObject;
  /** A definition of a PATCH operation on this path. */
  patch?: OperationObject | ReferenceObject;
  /** A definition of a TRACE operation on this path. */
  trace?: OperationObject | ReferenceObject;
  /** An alternative server array to service all operations in this path. */
  servers?: ServerObject[];
  /**
   * A list of parameters that are applicable for all the operations described under this path.
   * These parameters can be overridden at the operation level, but cannot be removed there. The
   * list MUST NOT include duplicated parameters. A unique parameter is defined by a combination of
   * a name and location. The list can use the Reference Object to link to parameters that are
   * defined at the OpenAPI Object’s components/parameters.
   */
  parameters?: (ParameterObject | ReferenceObject)[];
}

/**
 * [4.8.10] Operation Object
 * Describes a single API operation on a path.
 */
export interface OperationObject extends Extensable {
  /**
   * A list of tags for API documentation control. Tags can be used for logical grouping of
   * operations by resources or any other qualifier.
   */
  tags?: string[];
  /** A short summary of what the operation does. */
  summary?: string;
  /**
   * A verbose explanation of the operation behavior. CommonMark syntax MAY be used for rich text
   * representation.
   */
  description?: string;
  /** Additional external documentation for this operation. */
  externalDocs?: ExternalDocumentationObject;
  /**
   * Unique string used to identify the operation. The id MUST be unique among all operations
   * described in the API. The operationId value is case-sensitive. Tools and libraries MAY use the
   * operationId to uniquely identify an operation, therefore, it is RECOMMENDED to follow common
   * programming naming conventions.
   */
  operationId?: string;
  /**
   * A list of parameters that are applicable for this operation. If a parameter is already defined
   * at the Path Item, the new definition will override it but can never remove it. The list MUST
   * NOT include duplicated parameters. A unique parameter is defined by a combination of a name and
   * location. The list can use the Reference Object to link to parameters that are defined at the
   * OpenAPI Object’s components/parameters.
   */
  parameters?: (ParameterObject | ReferenceObject)[];
  /**
   * The request body applicable for this operation. The requestBody is fully supported in HTTP
   * methods where the HTTP 1.1 specification [RFC7231] has explicitly defined semantics for request
   * bodies. In other cases where the HTTP spec is vague (such as GET, HEAD and DELETE), requestBody
   * is permitted but does not have well-defined semantics and SHOULD be avoided if possible.
   */
  requestBody?: RequestBodyObject | ReferenceObject;
  /** The list of possible responses as they are returned from executing this operation. */
  responses?: ResponsesObject;
  /**
   * A map of possible out-of band callbacks related to the parent operation. The key is a unique
   * identifier for the Callback Object. Each value in the map is a Callback Object that describes a
   * request that may be initiated by the API provider and the expected responses.
   */
  callbacks?: Record<string, CallbackObject | ReferenceObject>;
  /**
   * Declares this operation to be deprecated. Consumers SHOULD refrain from usage of the declared
   * operation. Default value is false.
   */
  deprecated?: boolean;
  /**
   * A declaration of which security mechanisms can be used for this operation. The list of values
   * includes alternative security requirement objects that can be used. Only one of the security
   * requirement objects need to be satisfied to authorize a request. To make security optional, an
   * empty security requirement ({}) can be included in the array. This definition overrides any
   * declared top-level security. To remove a top-level security declaration, an empty array can be
   * used.
   */
  security?: SecurityRequirementObject[];
  /**
   * An alternative server array to service this operation. If an alternative server object is
   * specified at the Path Item Object or Root level, it will be overridden by this value.
   */
  servers?: ServerObject[];
}

/**
 * [4.8.18] Callback Object
 * A map of possible out-of band callbacks related to the parent operation. Each value in the map is
 * a Path Item Object that describes a set of requests that may be initiated by the API provider and
 * the expected responses. The key value used to identify the path item object is an expression,
 * evaluated at runtime, that identifies a URL to use for the callback operation.
 */
export type CallbackObject = Record<string, PathItemObject>;
