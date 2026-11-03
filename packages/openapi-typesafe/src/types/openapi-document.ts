import type {
  Extensable,
  ExternalDocumentationObject,
  ReferenceObject,
  ServerObject,
} from "./openapi-common.js";
import type { CallbackObject, PathItemObject } from "./openapi-path-item.js";
import type {
  ExampleObject,
  HeaderObject,
  MediaTypeObject,
  ParameterObject,
  RequestBodyObject,
} from "./openapi-request.js";
import type { LinkObject, ResponseObject } from "./openapi-response.js";
import type { $defs, SchemaObject } from "./openapi-schema.js";
import type { SecurityRequirementObject, SecuritySchemeObject } from "./openapi-security.js";

/**
 * [4.8] Schema
 * @see https://spec.openapis.org/oas/v3.1.0#schema
 */
export interface OpenAPI3 extends Extensable {
  /**
   * REQUIRED. This string MUST be the version number of the OpenAPI Specification that the OpenAPI
   * document uses. The openapi field SHOULD be used by tooling to interpret the OpenAPI document.
   * This is not related to the API info.version string.
   */
  openapi: string;
  /** REQUIRED. Provides metadata about the API. The metadata MAY be used by tooling as required. */
  info: InfoObject; // required
  /**
   * The default value for the $schema keyword within Schema Objects contained within this OAS
   * document. This MUST be in the form of a URI.
   */
  jsonSchemaDialect?: string;
  /**
   * An array of Server Objects, which provide connectivity information to a target server. If the
   * servers property is not provided, or is an empty array, the default value would be a Server
   * Object with a url value of /.
   */
  servers?: ServerObject[];
  /** The available paths and operations for the API. */
  paths?: PathsObject;
  /**
   * The incoming webhooks that MAY be received as part of this API and that the API consumer MAY
   * choose to implement. Closely related to the callbacks feature, this section describes requests
   * initiated other than by an API call, for example by an out of band registration. The key name
   * is a unique string to refer to each webhook, while the (optionally referenced) Path Item Object
   * describes a request that may be initiated by the API provider and the expected responses. An
   * example is available.
   */
  webhooks?: { [id: string]: PathItemObject | ReferenceObject };
  /** An element to hold various schemas for the document. */
  components?: ComponentsObject;
  /**
   * A declaration of which security mechanisms can be used across the API. The list of values
   * includes alternative security requirement objects that can be used. Only one of the security
   * requirement objects need to be satisfied to authorize a request. Individual operations can
   * override this definition. To make security optional, an empty security requirement ({}) can be
   * included in the array.
   */
  security?: SecurityRequirementObject[];
  /**
   * A list of tags used by the document with additional metadata. The order of the tags can be used
   * to reflect on their order by the parsing tools. Not all tags that are used by the Operation
   * Object must be declared. The tags that are not declared MAY be organized randomly or based on
   * the tools’ logic. Each tag name in the list MUST be unique.
   */
  tags?: TagObject[];
  /** Additional external documentation. */
  externalDocs?: ExternalDocumentationObject;
  $defs?: $defs;
}

/**
 * [4.8.2] Info Object
 * The object provides metadata about the API.
 */
export interface InfoObject extends Extensable {
  /** REQUIRED. The title of the API. */
  title: string;
  /** A short summary of the API. */
  summary?: string;
  /** A description of the API. CommonMark syntax MAY be used for rich text representation. */
  description?: string;
  /** A URL to the Terms of Service for the API. This MUST be in the form of a URL. */
  termsOfService?: string;
  /** The contact information for the exposed API. */
  contact?: ContactObject;
  /** The license information for the exposed API. */
  license?: LicenseObject;
  /**
   * REQUIRED. The version of the OpenAPI document (which is distinct from the OpenAPI Specification
   * version or the API implementation version).
   */
  version: string;
}

/**
 * [4.8.3] Contact Object
 * Contact information for the exposed API.
 */
export interface ContactObject extends Extensable {
  /** The identifying name of the contact person/organization. */
  name?: string;
  /** The URL pointing to the contact information. This MUST be in the form of a URL. */
  url?: string;
  /**
   * The email address of the contact person/organization. This MUST be in the form of an email
   * address.
   */
  email?: string;
}

/**
 * [4.8.4] License object
 * License information for the exposed API.
 */
export interface LicenseObject extends Extensable {
  /** REQUIRED. The license name used for the API. */
  name: string;
  /**
   * An SPDX license expression for the API. The identifier field is mutually exclusive of the url
   * field.
   */
  identifier: string;
  /**
   * A URL to the license used for the API. This MUST be in the form of a URL. The url field is
   * mutually exclusive of the identifier field.
   */
  url: string;
}

/**
 * [4.8.7] Components Object
 * Holds a set of reusable objects for different aspects of the OAS.
 */
export interface ComponentsObject extends Extensable {
  /** An object to hold reusable Schema Objects.*/
  schemas?: Record<string, SchemaObject>;
  /** An object to hold reusable Response Objects. */
  responses?: Record<string, ResponseObject | ReferenceObject>;
  /** An object to hold reusable Parameter Objects. */
  parameters?: Record<string, ParameterObject | ReferenceObject>;
  /** An object to hold reusable Example Objects. */
  examples?: Record<string, ExampleObject | ReferenceObject>;
  /** An object to hold reusable Request Body Objects. */
  requestBodies?: Record<string, RequestBodyObject | ReferenceObject>;
  /** An object to hold reusable Header Objects. */
  headers?: Record<string, HeaderObject | ReferenceObject>;
  /** An object to hold reusable Security Scheme Objects. */
  securitySchemes?: Record<string, SecuritySchemeObject | ReferenceObject>;
  /** An object to hold reusable Link Objects. */
  links?: Record<string, LinkObject | ReferenceObject>;
  /** An object to hold reusable Callback Objects. */
  callbacks?: Record<string, CallbackObject | ReferenceObject>;
  /** An object to hold reusable Path Item Objects. */
  pathItems?: Record<string, PathItemObject | ReferenceObject>;
  /** An object to hold reusable Media Type Objects (OpenAPI 3.2). */
  mediaTypes?: Record<string, MediaTypeObject | ReferenceObject>;
}

/**
 * [4.8.8] Paths Object
 * Holds the relative paths to the individual endpoints and their operations. The path is appended
 * to the URL from the Server Object in order to construct the full URL. The Paths MAY be empty, due
 * to Access Control List (ACL) constraints.
 */
export interface PathsObject {
  // note: paths object does support $refs; the schema just defines it in a weird way
  [pathname: string]: PathItemObject | ReferenceObject;
}

/**
 * [x.x.x] Webhooks Object
 * Holds the webhooks definitions, indexed by their names. A webhook is defined by a Path Item
 * Object; the only difference is that the request is initiated by the API provider.
 */
export interface WebhooksObject {
  [name: string]: PathItemObject;
}

/**
 * [4.8.22] Tag Object
 * Adds metadata to a single tag that is used by the Operation Object. It is not mandatory to have a
 * Tag Object per tag defined in the Operation Object instances.
 */
export interface TagObject extends Extensable {
  /** REQUIRED. The name of the tag. */
  name: string;
  /** A description for the tag. CommonMark syntax MAY be used for rich text representation. */
  description?: string;
  /** Additional external documentation for this tag. */
  externalDocs?: ExternalDocumentationObject;
}
