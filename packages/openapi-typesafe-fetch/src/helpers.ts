// HTTP types

export type HttpMethod =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace"
  /** OpenAPI 3.2: a safe, idempotent request with a body. */
  | "query";
/**
 * Some 2XX statuses, kept for code that names them. The client does not classify by this list: a
 * status is a success or an error by its first digit (`SuccessStatusKey`, `ErrorStatusKey`).
 */
export type OkStatus = 200 | 201 | 202 | 203 | 204 | 206 | 207 | "2XX";
/** Some 4XX and 5XX statuses and `default`, kept like `OkStatus`. */
export type ErrorStatus =
  | 500
  | 501
  | 502
  | 503
  | 504
  | 505
  | 506
  | 507
  | 508
  | 510
  | 511
  | "5XX"
  | 400
  | 401
  | 402
  | 403
  | 404
  | 405
  | 406
  | 407
  | 408
  | 409
  | 410
  | 411
  | 412
  | 413
  | 414
  | 415
  | 416
  | 417
  | 418
  | 420
  | 421
  | 422
  | 423
  | 424
  | 425
  | 426
  | 427
  | 428
  | 429
  | 430
  | 431
  | 444
  | 450
  | 451
  | 497
  | 498
  | 499
  | "4XX"
  | "default";

type StatusDigit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/**
 * The keys of a Response Object Map whose text matches a pattern. A generated map has numeric keys
 * (`200`) and string ones (`"2XX"`, `"default"`), and a numeric literal matches no template
 * literal type, so each key is matched by its text.
 */
type StatusKeysMatching<Keys, Pattern extends string> = Keys extends string | number
  ? `${Keys}` extends Pattern
    ? Keys
    : never
  : never;

/**
 * The success statuses of a Response Object Map: every 2XX one. A closed list of statuses left out
 * the ones it did not name (205, 208, 226), and their bodies were typed as no data.
 */
export type SuccessStatusKey<T> = StatusKeysMatching<
  keyof T,
  `2${StatusDigit}${StatusDigit}` | "2XX"
>;

/**
 * The error statuses of a Response Object Map: every 1XX, 3XX, 4XX and 5XX one, and `default`. The
 * client returns each response that is not `ok` as `error`, also a 3XX with `redirect: "manual"`.
 */
export type ErrorStatusKey<T> = StatusKeysMatching<
  keyof T,
  `${1 | 3 | 4 | 5}${StatusDigit}${StatusDigit}` | `${1 | 3 | 4 | 5}XX` | "default"
>;

/** Get a union of OK Statuses */
export type OKStatusUnion<T> = FilterKeys<T, SuccessStatusKey<T>>;

/** Get first error status, in order */
// biome-ignore format: this is dumb but reliable
export type FirstErrorStatus<T> =
  T extends { 500: unknown }   ? T[500] :
  T extends { 501: unknown }   ? T[501] :
  T extends { 502: unknown }   ? T[502] :
  T extends { 503: unknown }   ? T[503] :
  T extends { 504: unknown }   ? T[504] :
  T extends { 505: unknown }   ? T[505] :
  T extends { 506: unknown }   ? T[506] :
  T extends { 507: unknown }   ? T[507] :
  T extends { 508: unknown }   ? T[508] :
  T extends { 510: unknown }   ? T[510] :
  T extends { 511: unknown }   ? T[511] :
  T extends { "5XX": unknown } ? T["5XX"] :
  T extends { 400: unknown }   ? T[400] :
  T extends { 401: unknown }   ? T[401] :
  T extends { 402: unknown }   ? T[402] :
  T extends { 403: unknown }   ? T[403] :
  T extends { 404: unknown }   ? T[404] :
  T extends { 405: unknown }   ? T[405] :
  T extends { 406: unknown }   ? T[406] :
  T extends { 407: unknown }   ? T[407] :
  T extends { 408: unknown }   ? T[408] :
  T extends { 409: unknown }   ? T[409] :
  T extends { 410: unknown }   ? T[410] :
  T extends { 411: unknown }   ? T[411] :
  T extends { 412: unknown }   ? T[412] :
  T extends { 413: unknown }   ? T[413] :
  T extends { 414: unknown }   ? T[414] :
  T extends { 415: unknown }   ? T[415] :
  T extends { 416: unknown }   ? T[416] :
  T extends { 417: unknown }   ? T[417] :
  T extends { 418: unknown }   ? T[418] :
  T extends { 420: unknown }   ? T[420] :
  T extends { 421: unknown }   ? T[421] :
  T extends { 422: unknown }   ? T[422] :
  T extends { 423: unknown }   ? T[423] :
  T extends { 424: unknown }   ? T[424] :
  T extends { 425: unknown }   ? T[425] :
  T extends { 426: unknown }   ? T[426] :
  T extends { 427: unknown }   ? T[427] :
  T extends { 428: unknown }   ? T[428] :
  T extends { 429: unknown }   ? T[429] :
  T extends { 430: unknown }   ? T[430] :
  T extends { 431: unknown }   ? T[431] :
  T extends { 444: unknown }   ? T[444] :
  T extends { 450: unknown }   ? T[450] :
  T extends { 451: unknown }   ? T[451] :
  T extends { 497: unknown }   ? T[497] :
  T extends { 498: unknown }   ? T[498] :
  T extends { 499: unknown }   ? T[499] :
  T extends { "4XX": unknown } ? T["4XX"] :
  T extends { default: unknown } ? T["default"] : never;

// OpenAPI type helpers

/** The paths that have each of the methods: upstream's `PathsWithMethod`. */
type PathsWithEveryMethod<Paths extends {}, PathnameMethod extends HttpMethod> = {
  [Pathname in keyof Paths]: Paths[Pathname] extends {
    [K in PathnameMethod]: unknown;
  }
    ? Pathname
    : never;
}[keyof Paths];

/** The paths that have at least one method. */
type PathsWithAnyMethod<Paths extends {}> = {
  [Pathname in keyof Paths]: {
    [Method in HttpMethod]: Paths[Pathname] extends { [K in Method]: unknown } ? Pathname : never;
  }[HttpMethod];
}[keyof Paths];

/**
 * Given an OpenAPI **Paths Object**, find all paths that have the given method. For a union of
 * methods, the paths that have each of them, so a call with either method finds its operation.
 * For `HttpMethod` itself, a method not known yet, the paths that have any method too: TypeScript
 * uses it where a hook's `Method` is not inferred, as in `Parameters<typeof $api.queryOptions>`,
 * and the paths with every method were none (upstream #2178).
 *
 * A union with upstream's type, not a conditional type over the method: code that is generic in
 * the method (`Path extends PathsWithMethod<Paths, Method>`, as swr-openapi has) must still
 * relate one `PathsWithMethod` to another, and TypeScript cannot relate a type to a conditional
 * type that waits for its method (TS2344). For a known method the second member is `never`.
 */
export type PathsWithMethod<Paths extends {}, PathnameMethod extends HttpMethod> =
  | PathsWithEveryMethod<Paths, PathnameMethod>
  | (HttpMethod extends PathnameMethod ? PathsWithAnyMethod<Paths> : never);

/**
 * DO NOT USE!
 * Only used only for OperationObject type inference
 */
export interface OperationObject {
  // biome-ignore lint/suspicious/noExplicitAny: upstream's type; operations are inferred against it
  parameters: any;
  // biome-ignore lint/suspicious/noExplicitAny: upstream's type; operations are inferred against it
  requestBody: any; // note: "any" will get overridden in inference
  // biome-ignore lint/suspicious/noExplicitAny: upstream's type; operations are inferred against it
  responses: any;
}

/** Internal helper used in PathsWithMethod */
export type PathItemObject = {
  [M in HttpMethod]: OperationObject;
} & {
  // biome-ignore lint/suspicious/noExplicitAny: upstream's type; operations are inferred against it
  parameters?: any;
};

/** Return `responses` for an Operation Object */
// biome-ignore lint/suspicious/noExplicitAny: the result must meet the `Record` constraints below
export type ResponseObjectMap<T> = T extends { responses: any } ? T["responses"] : unknown;

/** Return `content` for a Response Object */
// biome-ignore lint/suspicious/noExplicitAny: upstream's type; `unknown` changes generic results
export type ResponseContent<T> = T extends { content: any } ? T["content"] : unknown;

/** Return type of `requestBody` for an Operation Object */
export type OperationRequestBody<T> = "requestBody" extends keyof T ? T["requestBody"] : never;

/** Internal helper to get object type with only the `requestBody` property */
type PickRequestBody<T> = "requestBody" extends keyof T ? Pick<T, "requestBody"> : never;

/** Resolve to `true` if request body is optional, else `false` */
export type IsOperationRequestBodyOptional<T> =
  RequiredKeysOf<PickRequestBody<T>> extends never ? true : false;

/** Internal helper used in OperationRequestBodyContent */
export type OperationRequestBodyMediaContent<T> =
  IsOperationRequestBodyOptional<T> extends true
    ? ResponseContent<NonNullable<OperationRequestBody<T>>> | undefined
    : ResponseContent<OperationRequestBody<T>>;

/** Return first `content` from a Request Object Mapping, allowing any media type */
export type OperationRequestBodyContent<T> =
  FilterKeys<OperationRequestBodyMediaContent<T>, MediaType> extends never
    ? FilterKeys<NonNullable<OperationRequestBodyMediaContent<T>>, MediaType> | undefined
    : FilterKeys<OperationRequestBodyMediaContent<T>, MediaType>;

/**
 * The statuses of success responses in a Response Object Map: the 2XX statuses, or `default` when
 * no 2XX status is declared. `default` covers every status the operation does not declare (OpenAPI
 * Responses Object), so then it covers every success (upstream #1862). With a 2XX status declared,
 * `default` is left to the errors, as before.
 */
type SuccessStatus<T> = [SuccessStatusKey<T>] extends [never]
  ? Extract<keyof T, "default">
  : SuccessStatusKey<T>;

/** `true` for `any`: a conditional type on `any` takes both branches, so `any` is checked first. */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Return all 2XX responses from a Response Object Map, or `default` if it declares no 2XX one. For
 * a union of maps (a call with a union of paths), the union of each map's responses: `keyof` of a
 * union is only the shared statuses, so one map of them lost the body of every path that did not
 * share its statuses, and a `default`-only path typed the data `undefined` (upstream). An `any`
 * map (`createClient<any>()`) gives `any`: no key of `keyof any` is a status, which gave `never`.
 */
export type SuccessResponse<
  // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
  T extends Record<string | number, any>,
  Media extends MediaType = MediaType,
> =
  IsAny<T> extends true
    ? T
    : T extends unknown
      ? ResponseBodies<T, Media, SuccessStatus<T>, never>
      : never;

/**
 * Return all 1XX, 3XX, 4XX, 5XX and `default` responses from a Response Object Map; for a union
 * of maps, the union of each map's responses, as `SuccessResponse`. An `any` map gives `any`.
 */
export type ErrorResponse<
  // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
  T extends Record<string | number, any>,
  Media extends MediaType = MediaType,
> =
  IsAny<T> extends true
    ? T
    : T extends unknown
      ? ResponseBodies<T, Media, ErrorStatusKey<T>, string>
      : never;

/**
 * The bodies of the responses `ResponseCode` as the client returns them (`ResponseBody`): each
 * success one as `SuccessResponse` gives it, each other one as `ErrorResponse` does.
 */
export type GetResponseContent<
  // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
  T extends Record<string | number, any>,
  Media extends MediaType = MediaType,
  ResponseCode extends keyof T = keyof T,
> =
  ResponseCode extends SuccessStatus<T>
    ? ResponseBodies<T, Media, ResponseCode, never>
    : ResponseBodies<T, Media, ResponseCode, string>;

/**
 * The bodies of the responses `ResponseCode`. A response without `content` keeps its `content`
 * type (`undefined` for `content?: never`). `OtherBody` is the class's body that is not JSON: it
 * is passed in, not read from the status, so the result for a generic map stays a type that
 * TypeScript relates to the one of another client (ADR-030).
 */
type ResponseBodies<
  // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
  T extends Record<string | number, any>,
  Media,
  ResponseCode extends keyof T,
  OtherBody,
> = ResponseCode extends keyof T
  ? {
      // biome-ignore lint/suspicious/noExplicitAny: unknown rejects interface content types
      [K in ResponseCode]: T[K]["content"] extends Record<string, any>
        ? ResponseBody<T[K]["content"], Media, OtherBody>
        : K extends keyof T
          ? T[K]["content"]
          : never;
    }[ResponseCode]
  : never;

/**
 * The body of one response with the content map `Content`, as the client returns it. `Media`
 * picks among its media types, as an `Accept` header does, and each one picked gives its schema.
 * A response with none of them can still arrive (a proxy's HTML 500), so it gives what the client
 * makes of its bodies: a JSON body gives its schema, any other body `OtherBody`, a `string` for an
 * error (the client returns the text) and nothing for a success (the default `parseAs: "json"`
 * rejects it; another `parseAs` types the data by itself). `Media` is read only in
 * `keyof Content & Media`, as in `FilterKeys`, so TypeScript still relates the results of two
 * clients with different `Media` in generic code (ADR-030).
 */
type ResponseBody<Content, Media, OtherBody> =
  | ([keyof Content & Media] extends [never] ? JSONLike<Content> : Content[keyof Content & Media])
  | ([keyof Content & Media] extends [never]
      ? false extends { [Key in keyof Content]: IsJSONMediaType<Key> }[keyof Content]
        ? OtherBody
        : never
      : never);

/**
 * The media types that the client parses as JSON, as a content map writes them: `json` or a
 * `+json` suffix (RFC 6838), with or without parameters, as the client's `JSON_MEDIA_TYPE_RE`, and
 * the wildcards for any type and any `application` type, which may hold JSON. Not `x-ndjson` or
 * `json-seq`, whose bodies are lines of JSON.
 */
type JSONMediaType =
  | `${string}/${"" | `${string}+`}json`
  | `${string}/${"" | `${string}+`}json${";" | " " | "\t"}${string}`
  | "*/*"
  | "application/*";

/** Whether the client parses a body of the media type `Key` as JSON, in any letter case. */
type IsJSONMediaType<Key> = Key extends string
  ? Lowercase<Key> extends JSONMediaType
    ? true
    : false
  : false;

/** Return first JSON-like 2XX response from a path + HTTP method */
// biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
export type SuccessResponseJSON<PathMethod extends Record<string | number, any>> = SuccessResponse<
  ResponseObjectMap<PathMethod>,
  JSONMediaType
>;

/** Return JSON-like 1XX, 3XX, 4XX, 5XX and `default` responses from a path + HTTP method */
// biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
export type ErrorResponseJSON<PathMethod extends Record<string | number, any>> = ErrorResponse<
  ResponseObjectMap<PathMethod>,
  JSONMediaType
>;

/** Return JSON-like request body from a path + HTTP method */
export type RequestBodyJSON<PathMethod> = JSONLike<
  FilterKeys<OperationRequestBody<PathMethod>, "content">
>;

// Generic TS utils

/** Find first match of multiple keys */
export type FilterKeys<Obj, Matchers> = Obj[keyof Obj & Matchers];
/**
 * @deprecated Use `FilterKeys` instead
 * Get the type of a value of an input object with a given key. If the key is
 * not found, return a default type. Works with unions of objects too.
 */
export type GetValueWithDefault<Obj, KeyPattern, Default> = Obj extends unknown
  ? FilterKeys<Obj, KeyPattern> extends never
    ? Default
    : FilterKeys<Obj, KeyPattern>
  : never;

/**
 * Return any `[string]/[string]` media type (important because openapi-typesafe-fetch allows any
 * content response, not just JSON-like)
 */
export type MediaType = `${string}/${string}`;
/**
 * The values of the JSON media types of a content map, as the client parses them: `json` or a
 * `+json` suffix, with or without parameters ("application/json", "application/vnd.api+json",
 * "application/json; charset=utf-8").
 */
export type JSONLike<T> = {
  [Key in keyof T]: IsJSONMediaType<Key> extends true ? T[Key] : never;
}[keyof T];

/**
 * Filter objects that have required keys
 * @deprecated Use `RequiredKeysOf` instead
 */
export type FindRequiredKeys<T, K extends keyof T> = K extends unknown
  ? undefined extends T[K]
    ? never
    : K
  : K;
/**
 * Does this object contain required keys?
 * @deprecated Use `RequiredKeysOf` instead
 */
export type HasRequiredKeys<T> = FindRequiredKeys<T, keyof T>;

/**
 * Helper to get the required keys of an object. If no keys are required, will be `undefined` with
 * strictNullChecks enabled, else `never`
 */
type RequiredKeysOfHelper<T> = {
  [K in keyof T]: {} extends Pick<T, K> ? never : K;
}[keyof T];
/** Get the required keys of an object, or `never` if no keys are required */
export type RequiredKeysOf<T> =
  RequiredKeysOfHelper<T> extends undefined ? never : RequiredKeysOfHelper<T>;

// readOnly/writeOnly visibility markers and helpers

/** Marker type for readOnly properties (excluded from request bodies) */
export type $Read<T> = { readonly $read: T };

/** Marker type for writeOnly properties (excluded from response bodies) */
export type $Write<T> = { readonly $write: T };

/** Primitives, also branded ones (`string & { __brand: "Id" }`), which stay unmapped (#2765). */
type ReadWritePrimitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Types that stay unmapped. Mapping a function type drops its call signatures, so a `Blob` from
 * `--binary-as-blob` lost its methods (`arrayBuffer()`, `text()`, ...) in response data.
 */
type ReadWriteLeaf = ReadWritePrimitive | ((...args: never) => unknown);

/**
 * Keys of `T` whose value is a `Marker`. A key whose value is only `null` or `undefined` is not
 * marked: `NonNullable` of it is `never`, and `never` extends every marker (upstream #2717). An
 * `any` key is not marked either (`0 extends 1 & T[K]` is true only for `any`): a check on `any`
 * takes both branches, so `Readable` dropped the key and `Writable` typed it `undefined`. The
 * checks are not distributive (their check types are not type parameters), so `never` is seen.
 * The keys are read by remapping, not as `{ ... }[keyof T]`: with an index signature (from
 * `additionalProperties`) `keyof T` is `string`, which indexes the signature only, so no property
 * was marked and `Writable` made a readOnly property a required `never`.
 */
type ReadWriteMarkedKeys<T, Marker> = keyof {
  [K in keyof T as 0 extends 1 & T[K]
    ? never
    : NonNullable<T[K]> extends never
      ? never
      : NonNullable<T[K]> extends Marker
        ? K
        : never]: never;
};

/**
 * Resolve an array or a tuple element by element. An array uses `T[number]`, not `infer E`: for an
 * intersection of arrays (`allOf`) inference keeps one member and narrowing breaks (upstream
 * #2620). `T` is a plain array when an array of its elements is assignable to it; otherwise it is a
 * tuple (also `[A, ...B[]]`), mapped homomorphically to stay a tuple (upstream #2632). Both keep
 * `readonly` (upstream #2615).
 */
type ReadWriteResolveArray<
  T extends readonly unknown[],
  Resolved extends "read" | "write",
> = T[number][] extends T
  ? T extends unknown[]
    ? ReadWriteResolve<T[number], Resolved>[]
    : readonly ReadWriteResolve<T[number], Resolved>[]
  : { [K in keyof T]: ReadWriteResolve<T[K], Resolved> };

type ReadWriteResolve<T, Resolved extends "read" | "write"> = Resolved extends "read"
  ? Readable<T>
  : Writable<T>;

// The markers are matched with `any`, as in the helper types that the generator writes.
// biome-ignore-start lint/suspicious/noExplicitAny: the same text as the generated helper types
/**
 * Resolve type for reading (responses): strips $Write properties, unwraps $Read
 * - $Read<T> → T (readable), continues recursion
 * - $Write<T> → never (excluded from response)
 * - primitives (also branded), functions, arrays and tuples keep their shape; objects resolve
 *   recursively
 */
export type Readable<T> =
  T extends $Write<any>
    ? never
    : T extends $Read<infer U>
      ? Readable<U>
      : T extends ReadWriteLeaf
        ? T
        : T extends readonly unknown[]
          ? ReadWriteResolveArray<T, "read">
          : T extends object
            ? {
                [K in keyof T as K extends ReadWriteMarkedKeys<T, $Write<any>>
                  ? never
                  : K]: Readable<T[K]>;
              }
            : T;

/**
 * Resolve type for writing (requests): strips $Read properties, unwraps $Write
 * - $Write<T> → T (writable), continues recursion
 * - $Read<T> → never (excluded from request)
 * - primitives (also branded), functions, arrays and tuples keep their shape; objects resolve
 *   recursively
 */
export type Writable<T> =
  T extends $Read<any>
    ? never
    : T extends $Write<infer U>
      ? Writable<U>
      : T extends ReadWriteLeaf
        ? T
        : T extends readonly unknown[]
          ? ReadWriteResolveArray<T, "write">
          : T extends object
            ? {
                [K in keyof T as K extends ReadWriteMarkedKeys<T, $Read<any>>
                  ? never
                  : K]: Writable<T[K]>;
              } & {
                [K in ReadWriteMarkedKeys<T, $Read<any>>]?: never;
              }
            : T;
// biome-ignore-end lint/suspicious/noExplicitAny: the same text as the generated helper types
