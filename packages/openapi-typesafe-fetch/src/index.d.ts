import type {
  ErrorResponse,
  FilterKeys,
  HttpMethod,
  IsOperationRequestBodyOptional,
  MediaType,
  OperationRequestBodyContent,
  PathsWithMethod,
  Readable,
  RequiredKeysOf,
  ResponseObjectMap,
  SuccessResponse,
  Writable,
} from "openapi-typesafe-helpers";

/** Options for each client instance */
export interface ClientOptions extends Omit<RequestInit, "headers"> {
  /** set the common root URL for all API requests */
  baseUrl?: string;
  /** custom fetch (defaults to globalThis.fetch) */
  fetch?: (input: Request) => Promise<Response>;
  /** custom Request (defaults to globalThis.Request) */
  Request?: typeof Request;
  /** global querySerializer */
  querySerializer?: QuerySerializer<unknown> | QuerySerializerOptions;
  /** global bodySerializer */
  bodySerializer?: BodySerializer<unknown>;
  /** global pathSerializer */
  pathSerializer?: PathSerializer;
  headers?: HeadersOptions;
  /**
   * RequestInit extension object to pass as 2nd argument to fetch when supported (defaults to
   * undefined)
   */
  requestInitExt?: Record<string, unknown>;
}

/**
 * `ClientOptions` for a Fetch API implementation with its own types, such as the `undici` package
 * (upstream #2562). TypeScript cannot relate its `Request` and `Response` to the DOM lib's
 * (`duplex`, `RequestDestination`, `BodyInit` differ), so only what the client needs is checked: a
 * `fetch` that returns a promise and a `Request` class that takes a URL. Pass the `fetch` and the
 * `Request` of the same implementation; middleware and results still use the DOM types. The
 * `createClient` overload with `ClientOptions` comes first, so an inline `fetch` gets a typed
 * `Request` input.
 */
export interface CustomFetchClientOptions extends Omit<ClientOptions, "fetch" | "Request"> {
  /** `fetch` of another implementation (for example `fetch` from `undici`) */
  fetch?: (input: never, init?: never) => PromiseLike<object>;
  /** `Request` of the same implementation (for example `Request` from `undici`) */
  Request?: new (
    input: string,
    init: never,
  ) => object;
}

export type HeadersOptions =
  | Required<RequestInit>["headers"]
  | Record<string, string | number | boolean | (string | number | boolean)[] | null | undefined>;

export type QuerySerializer<T> = (
  // biome-ignore lint/suspicious/noExplicitAny: T["parameters"]["query"] needs an any constraint
  query: T extends { parameters: any }
    ? NonNullable<T["parameters"]["query"]>
    : Record<string, unknown>,
) => string;

/** @see https://swagger.io/docs/specification/serialization/#query */
export type QuerySerializerOptions = {
  /**
   * Set serialization for arrays.
   * @see https://swagger.io/docs/specification/serialization/#query
   */
  array?: {
    /** default: "form" */
    style: "form" | "spaceDelimited" | "pipeDelimited";
    /** default: true */
    explode: boolean;
  };
  /**
   * Set serialization for objects.
   * @see https://swagger.io/docs/specification/serialization/#query
   */
  object?: {
    /** default: "deepObject" */
    style: "form" | "deepObject";
    /** default: true */
    explode: boolean;
  };
  /**
   * The `allowReserved` keyword specifies whether the reserved characters
   * `:/?#[]@!$&'()*+,;=` in parameter values are allowed to be sent as they
   * are, or should be percent-encoded. By default, allowReserved is `false`,
   * and reserved characters are percent-encoded.
   * @see https://swagger.io/docs/specification/serialization/#query
   */
  allowReserved?: boolean;
};

// The result is the fetch body; openapi-fetch types it as `any` (ADR-030).
// biome-ignore lint/suspicious/noExplicitAny: openapi-fetch's type, kept for parity
export type BodySerializer<T> = (body: OperationRequestBodyContent<T>) => any;

export type PathSerializer = (pathname: string, pathParams: Record<string, unknown>) => string;

type BodyType<T = unknown> = {
  json: T;
  text: Awaited<ReturnType<Response["text"]>>;
  blob: Awaited<ReturnType<Response["blob"]>>;
  arrayBuffer: Awaited<ReturnType<Response["arrayBuffer"]>>;
  stream: Response["body"];
};
export type ParseAs = keyof BodyType;
export type ParseAsResponse<T, Options> = Options extends {
  parseAs: ParseAs;
}
  ? BodyType<T>[Options["parseAs"]]
  : T;

export interface DefaultParamsOption {
  params?: {
    query?: Record<string, unknown>;
  };
}

export type ParamsOption<T> = T extends {
  parameters: unknown;
}
  ? RequiredKeysOf<T["parameters"]> extends never
    ? { params?: T["parameters"] }
    : { params: T["parameters"] }
  : DefaultParamsOption;

/** `true` for `any`: the operation of `createClient<any>()`, which says nothing about its body. */
type IsAny<T> = 0 extends 1 & T ? true : false;

// Writable<T> strips $Read markers (readOnly properties excluded from request body).
// An `any` operation is checked first: a conditional type on `any` takes both branches, which
// gave `{ body?: never } | { body: any }` and so a required init (upstream #2526).
export type RequestBodyOption<T> =
  IsAny<T> extends true
    ? // biome-ignore lint/suspicious/noExplicitAny: an any schema takes any body (upstream #2526)
      { body?: any }
    : Writable<OperationRequestBodyContent<T>> extends never
      ? { body?: never }
      : IsOperationRequestBodyOptional<T> extends true
        ? { body?: Writable<OperationRequestBodyContent<T>> }
        : { body: Writable<OperationRequestBodyContent<T>> };

/**
 * The init of a call to the operation `T`; for a union of operations, the union of their inits. It
 * distributes so that the client's init type and a wrapper's `FetchOptions` of a generic path are
 * the same type, which TypeScript can relate: an alias that distributed only inside the client
 * gave a conditional type no `FetchOptions` argument was assignable to (TS2345). The operations
 * of a union are not merged into one deep init type, which gave TS2589 on hundreds of paths
 * (upstream #1882).
 */
export type FetchOptions<T> = T extends unknown
  ? RequestOptions<T> & Omit<RequestInit, "body" | "headers">
  : never;

// Readable<T> strips $Write markers (writeOnly properties excluded from response)
export type FetchResponse<
  // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
  T extends Record<string | number, any>,
  Options,
  Media extends MediaType,
> =
  | {
      data: ParseAsResponse<Readable<SuccessResponse<ResponseObjectMap<T>, Media>>, Options>;
      error?: never;
      response: Response;
    }
  | {
      data?: never;
      error: Readable<ErrorResponse<ResponseObjectMap<T>, Media>>;
      response: Response;
    };

export type RequestOptions<T> = ParamsOption<T> &
  RequestBodyOption<T> & {
    baseUrl?: string;
    querySerializer?: QuerySerializer<T> | QuerySerializerOptions;
    bodySerializer?: BodySerializer<T>;
    pathSerializer?: PathSerializer;
    parseAs?: ParseAs;
    fetch?: ClientOptions["fetch"];
    headers?: HeadersOptions;
    middleware?: Middleware[];
  };

export type MergedOptions<T = unknown> = {
  baseUrl: string;
  parseAs: ParseAs;
  querySerializer: QuerySerializer<T>;
  bodySerializer: BodySerializer<T>;
  pathSerializer: PathSerializer;
  fetch: typeof globalThis.fetch;
};

export interface MiddlewareRequestParams {
  query?: Record<string, unknown>;
  header?: Record<string, unknown>;
  path?: Record<string, unknown>;
  cookie?: Record<string, unknown>;
}

export interface MiddlewareCallbackParams {
  /** Current Request object */
  request: Request;
  /** The original OpenAPI schema path (including curly braces) */
  readonly schemaPath: string;
  /** OpenAPI parameters as provided from openapi-typesafe-fetch */
  readonly params: MiddlewareRequestParams;
  /** Unique ID for this request */
  readonly id: string;
  /** The options of this request after merging the client and request options (read-only) */
  readonly options: MergedOptions;
}

type MiddlewareOnRequest = (
  options: MiddlewareCallbackParams,
) => void | Request | Response | undefined | Promise<Request | Response | undefined | void>;
type MiddlewareOnResponse = (
  options: MiddlewareCallbackParams & { response: Response },
) => void | Response | undefined | Promise<Response | undefined | void>;
type MiddlewareOnError = (
  options: MiddlewareCallbackParams & { error: unknown },
) => void | Response | Error | Promise<void | Response | Error>;

export type Middleware =
  | {
      onRequest: MiddlewareOnRequest;
      onResponse?: MiddlewareOnResponse;
      onError?: MiddlewareOnError;
    }
  | {
      onRequest?: MiddlewareOnRequest;
      onResponse: MiddlewareOnResponse;
      onError?: MiddlewareOnError;
    }
  | {
      onRequest?: MiddlewareOnRequest;
      onResponse?: MiddlewareOnResponse;
      onError: MiddlewareOnError;
    };

/**
 * This type helper makes the 2nd function param required if params/requestBody are required;
 * otherwise, optional. `Location` is any key: with `Paths extends {}` a method is not known to be a
 * key of `Paths[Path]` (upstream #2267). For a union of operations, the union of their inits: one
 * deep type of every init gave TS2589 on hundreds of paths (upstream #1882).
 */
export type MaybeOptionalInit<Params, Location extends PropertyKey> = OperationInits<
  FilterKeys<Params, Location>
>;

/**
 * The inits of the operations, and `undefined` only when none of them requires anything. One
 * operation's init is `undefined` too when nothing in it is required, as in openapi-fetch. For a
 * union of operations (a union of paths, or `Parameters<typeof client.request>`), `undefined`
 * would make the whole init optional, although a call to one of the paths sends the init it gets,
 * and a path parameter left out stays `{id}` in the URL.
 * One conditional type, as openapi-fetch's, not a union with a conditional `undefined`: while the
 * operation is generic, a union made `FetchResponse` distribute over its members, so the `data` of
 * a generic wrapper's call no longer related to `FetchResponse<Paths[Path][Method], Init, Media>`.
 * Its check type is not a type parameter, so TypeScript takes a `FetchOptions` of a generic path
 * for it when that type fits both branches. `FetchOptions` itself makes one init per operation:
 * while the path is generic it stays an alias, not an `infer` type, which TypeScript reads as
 * `unknown`, so the init stays the contextual type of an argument and a literal such as
 * `"available"` keeps its type (swr-openapi's `Exact<Init>` checks).
 */
type OperationInits<Operation> =
  RequiredKeysOf<FetchOptions<Operation>> extends never
    ? FetchOptions<Operation> | undefined
    : FetchOptions<Operation>;

// The final init param to accept.
// - Determines if the param is optional or not.
// - Performs arbitrary [key: string] addition.
// Note: the addition MUST happen after all the inference happens (otherwise TS can’t infer if
// init is required or not).
// - The condition is openapi-fetch's. TypeScript relates two conditional types only when their
//   `extends` types are the same and their check types relate, so a client type written against
//   openapi-fetch's `InitParam` (a wrapper, a cast) accepted this client only with this condition.
//   A union of inits is required through `MaybeOptionalInit`, which then leaves out `undefined`.
// - The addition is a named alias: written out in both branches, TypeScript gave `never` for
//   `Parameters` of the methods.
type InitParam<Init> =
  RequiredKeysOf<Init> extends never ? [WithAnyKeys<Init>?] : [WithAnyKeys<Init>];

/** The init with any other key (`[key: string]: unknown`), added after inference. */
type WithAnyKeys<Init> = Init & { [key: string]: unknown };

/**
 * @internal Exported for openapi-typesafe-react-query only; not part of the API (ADR-034).
 * The operation of `Method` on `Path`. Not `Paths[Path][Method]`: `Paths` is only `{}`, because
 * the generated `interface paths` has no index signature and failed a `Record<string, …>`
 * constraint with TS2344 (upstream #2267), so TypeScript does not know `Method` is a key. For a
 * union of paths or methods, the union of their operations; a method a path lacks (`put?: never`)
 * adds none.
 */
export type PathOperation<Paths, Path, Method> = Extract<
  FilterKeys<PathItem<Paths, Path>, Method>,
  // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
  Record<string | number, any>
>;

/**
 * The path item of each path of `Path`. Not `Paths[Path & keyof Paths]`: with template keys
 * (`--path-params-as-types`), `/apps/${string}` intersected with the keys is every key it
 * overlaps, such as `/apps/${string}/logs/${number}`, so a call to one path got the responses of
 * the others too once the responses distribute over the operations.
 */
type PathItem<Paths, Path> = Path extends keyof Paths ? Paths[Path] : never;

export type ClientMethod<Paths extends {}, Method extends HttpMethod, Media extends MediaType> = <
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
>(
  url: Path,
  ...init: InitParam<Init>
) => Promise<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>;

export type ClientRequestMethod<Paths extends {}, Media extends MediaType> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
>(
  method: Method,
  url: Path,
  ...init: InitParam<Init>
) => Promise<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>;

// Only HTTP method keys become calls: `parameters` and `additionalOperations` are not methods.
// They are left out by `Pick`, which keeps the `?` of a method, not by the key remapping: that is
// openapi-fetch's, and TypeScript relates two generic mapped types only when their key remappings
// are the same, so a path-based client type written like openapi-fetch's failed a cast (TS2352).
export type ClientForPath<
  // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
  PathInfo extends Record<string | number, any>,
  Media extends MediaType,
> = PathMethodCalls<Pick<PathInfo, HttpMethod & keyof PathInfo>, Media>;

// biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
type PathMethodCalls<PathInfo extends Record<string | number, any>, Media extends MediaType> = {
  [Method in keyof PathInfo as Uppercase<string & Method>]: <
    Init extends MaybeOptionalInit<PathInfo, Method>,
  >(
    ...init: InitParam<Init>
  ) => Promise<FetchResponse<PathInfo[Method], Init, Media>>;
};

export interface Client<Paths extends {}, Media extends MediaType = MediaType> {
  request: ClientRequestMethod<Paths, Media>;
  /** Call a GET endpoint */
  GET: ClientMethod<Paths, "get", Media>;
  /** Call a PUT endpoint */
  PUT: ClientMethod<Paths, "put", Media>;
  /** Call a POST endpoint */
  POST: ClientMethod<Paths, "post", Media>;
  /** Call a DELETE endpoint */
  DELETE: ClientMethod<Paths, "delete", Media>;
  /** Call a OPTIONS endpoint */
  OPTIONS: ClientMethod<Paths, "options", Media>;
  /** Call a HEAD endpoint */
  HEAD: ClientMethod<Paths, "head", Media>;
  /** Call a PATCH endpoint */
  PATCH: ClientMethod<Paths, "patch", Media>;
  /** Call a TRACE endpoint */
  TRACE: ClientMethod<Paths, "trace", Media>;
  /** Call a QUERY endpoint (OpenAPI 3.2) */
  QUERY: ClientMethod<Paths, "query", Media>;
  /** Register middleware */
  use(...middleware: Middleware[]): void;
  /** Unregister middleware */
  eject(...middleware: Middleware[]): void;
}

export type ClientPathsWithMethod<
  // biome-ignore lint/suspicious/noExplicitAny: matches a client of any paths, as in openapi-fetch
  CreatedClient extends Client<any, any>,
  Method extends HttpMethod,
> =
  CreatedClient extends Client<infer Paths, infer _Media> ? PathsWithMethod<Paths, Method> : never;

export type MethodResponse<
  // biome-ignore lint/suspicious/noExplicitAny: matches a client of any paths, as in openapi-fetch
  CreatedClient extends Client<any, any>,
  Method extends HttpMethod,
  Path extends ClientPathsWithMethod<CreatedClient, Method>,
  Options = {},
> =
  CreatedClient extends Client<
    // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
    infer Paths extends { [key: string]: any },
    infer Media extends MediaType
  >
    ? NonNullable<FetchResponse<Paths[Path][Method], Options, Media>["data"]>
    : never;

export default function createClient<Paths extends {}, Media extends MediaType = MediaType>(
  clientOptions?: ClientOptions,
): Client<Paths, Media>;
export default function createClient<Paths extends {}, Media extends MediaType = MediaType>(
  clientOptions?: CustomFetchClientOptions,
): Client<Paths, Media>;

export type PathBasedClient<
  // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
  Paths extends Record<string | number, any>,
  Media extends MediaType = MediaType,
> = {
  [Path in keyof Paths]: ClientForPath<Paths[Path], Media>;
};

export declare function wrapAsPathBasedClient<
  Paths extends {},
  Media extends MediaType = MediaType,
>(client: Client<Paths, Media>): PathBasedClient<Paths, Media>;

export declare function createPathBasedClient<
  Paths extends {},
  Media extends MediaType = MediaType,
>(clientOptions?: ClientOptions): PathBasedClient<Paths, Media>;
export declare function createPathBasedClient<
  Paths extends {},
  Media extends MediaType = MediaType,
>(clientOptions?: CustomFetchClientOptions): PathBasedClient<Paths, Media>;

/** Serialize primitive params to string */
export declare function serializePrimitiveParam(
  name: string,
  value: string,
  options?: { allowReserved?: boolean },
): string;

/** Serialize object param to string */
export declare function serializeObjectParam(
  name: string,
  value: Record<string, unknown>,
  options: {
    style: "simple" | "label" | "matrix" | "form" | "deepObject";
    explode: boolean;
    allowReserved?: boolean;
  },
): string;

/** Serialize array param to string */
export declare function serializeArrayParam(
  name: string,
  value: unknown[],
  options: {
    style: "simple" | "label" | "matrix" | "form" | "spaceDelimited" | "pipeDelimited";
    explode: boolean;
    allowReserved?: boolean;
  },
): string;

/** Serialize query params to string */
export declare function createQuerySerializer<T = unknown>(
  options?: QuerySerializerOptions,
): (queryParams: T) => string;

/**
 * Handle different OpenAPI 3.x serialization styles
 * @type {import("./index.js").defaultPathSerializer}
 * @see https://swagger.io/docs/specification/serialization/#path
 */
export declare function defaultPathSerializer(
  pathname: string,
  pathParams: Record<string, unknown>,
): string;

/** Bodies that `fetch` sends as they are, so `defaultBodySerializer` returns them unchanged. */
type RawRequestBody = FormData | Blob | URLSearchParams | ArrayBuffer | ArrayBufferView;

/**
 * The result of `defaultBodySerializer` for a body of type `Body`: the body itself when it is raw,
 * `undefined` for `undefined` (`JSON.stringify` gives it back), `ObjectResult` for an object, and a
 * string otherwise. `unknown` (and `any`) may be any of these.
 */
type SerializedBody<Body, ObjectResult> = unknown extends Body
  ? RawRequestBody | string | FormData | undefined
  : Body extends RawRequestBody
    ? Body
    : Body extends undefined
      ? undefined
      : Body extends object
        ? ObjectResult
        : string;

/** The `Content-Type` values that make `defaultBodySerializer` turn an object into `FormData`. */
type MultipartMediaType = "multipart/form-data" | `multipart/form-data;${string}`;

/** `Headers` drops the spaces and tabs in front of a value before the media type is read. */
type TrimmedStart<Text extends string> = Text extends ` ${infer Rest}` | `\t${infer Rest}`
  ? TrimmedStart<Rest>
  : Text;

/**
 * The `Content-Type` of headers written as a record, in any letter case of the name: `never` when
 * the record has none, `unknown` when the type does not tell (`Headers`, pairs, a string record).
 */
type ContentTypeOf<GivenHeaders> = GivenHeaders extends undefined
  ? never
  : GivenHeaders extends readonly unknown[] | { get(name: string): unknown }
    ? unknown
    : string extends keyof GivenHeaders
      ? unknown
      : ContentTypeEntries<GivenHeaders>[keyof GivenHeaders];

/** For each entry of a header record: its value when it is the `Content-Type`, else `never`. */
type ContentTypeEntries<Record> = { [Name in keyof Record]: ContentTypeEntry<Name, Record[Name]> };

/** The value of a header record entry when its name is `Content-Type` in any letter case. */
type ContentTypeEntry<Name, Value> =
  Lowercase<Name & string> extends "content-type" ? Value : never;

/**
 * What an object becomes with a `Content-Type` of type `ContentType`: `FormData` for a multipart
 * one, a string for any other one or for none, and either when the type is not a literal.
 */
type ObjectBodyResult<ContentType> = [ContentType] extends [never]
  ? string
  : ContentType extends null | undefined
    ? string
    : ContentType extends string
      ? string extends ContentType
        ? string | FormData
        : Lowercase<TrimmedStart<ContentType>> extends MultipartMediaType
          ? FormData
          : string
      : string | FormData;

/**
 * Serialize a request body. A raw body (`FormData`, `Blob`, `URLSearchParams`, `ArrayBuffer`, a
 * typed array) is returned as it is. With `headers`: a form `Content-Type` gives URL-encoded form
 * data, a `multipart/form-data` one turns an object into `FormData`, and another non-JSON one keeps
 * a string as it is. Anything else is JSON. Without `headers` an object can only become JSON.
 * Headers written as a record literal tell the result type of an object body: `FormData` for a
 * multipart `Content-Type`, `string` for another one or none. Other headers: `string | FormData`.
 */
export declare function defaultBodySerializer<T>(body: T): SerializedBody<T, string>;
export declare function defaultBodySerializer<
  T,
  const GivenHeaders extends HeadersOptions | undefined,
>(body: T, headers: GivenHeaders): SerializedBody<T, ObjectBodyResult<ContentTypeOf<GivenHeaders>>>;

/** Construct URL string from baseUrl and handle path and query params */
export declare function createFinalURL<O>(
  pathname: string,
  options: {
    baseUrl: string;
    params: {
      query?: Record<string, unknown>;
      path?: Record<string, unknown>;
    };
    querySerializer: QuerySerializer<O>;
    pathSerializer: PathSerializer;
  },
): string;

/** Merge headers a and b, with b taking priority */
export declare function mergeHeaders(...allHeaders: (HeadersOptions | undefined)[]): Headers;

/** Remove trailing slash from url */
export declare function removeTrailingSlash(url: string): string;

/**
 * Return a new ID, unique within the process: the request `id` that middleware callbacks get.
 * It comes from a counter shared by all clients, not from `Math.random()`; the name is upstream's.
 */
export declare function randomID(): string;
