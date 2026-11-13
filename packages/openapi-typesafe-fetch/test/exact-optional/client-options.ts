import createClient, {
  type BodySerializer,
  type ClientOptions,
  createPathBasedClient,
  type HeadersOptions,
  type Middleware,
  type ParseAs,
  type PathSerializer,
  type QuerySerializerOptions,
} from "../../src/index.js";

/**
 * Checked with `exactOptionalPropertyTypes` by `exact-optional.test.ts`: a wrapper passes its own
 * optional client and request options on, which are `undefined` when left out; the client counts
 * each of them as left out.
 */

type Paths = {
  "/items": {
    post: {
      parameters: { query?: { tags?: string[] } };
      requestBody?: { content: { "application/json": { name: string } } };
      responses: { 200: { headers: {}; content: { "application/json": string[] } } };
    };
    get: {
      responses: { 200: { headers: {}; content: { "application/json": string[] } } };
    };
  };
};

export type WrapperOptions = {
  baseUrl?: string;
  fetch?: ClientOptions["fetch"];
  Request?: typeof Request;
  FormData?: typeof FormData;
  querySerializer?: QuerySerializerOptions;
  bodySerializer?: BodySerializer<unknown>;
  pathSerializer?: PathSerializer;
  headers?: HeadersOptions;
  requestInitExt?: Record<string, unknown>;
  parseAs?: ParseAs;
  middleware?: Middleware[];
};

export function makeClient(options: WrapperOptions) {
  return createClient<Paths>({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    Request: options.Request,
    FormData: options.FormData,
    querySerializer: options.querySerializer,
    bodySerializer: options.bodySerializer,
    pathSerializer: options.pathSerializer,
    headers: options.headers,
    requestInitExt: options.requestInitExt,
  });
}

/** Typed as `ClientOptions` itself: a call could also match the overload for another `fetch`. */
export function toClientOptions(options: WrapperOptions): ClientOptions {
  return { fetch: options.fetch, Request: options.Request, FormData: options.FormData };
}

export function makePathBasedClient(options: WrapperOptions) {
  return createPathBasedClient<Paths>({ baseUrl: options.baseUrl, headers: options.headers });
}

export function addItem(options: WrapperOptions, name?: string) {
  return makeClient(options).POST("/items", {
    params: undefined,
    body: name === undefined ? undefined : { name },
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    querySerializer: options.querySerializer,
    bodySerializer: options.bodySerializer,
    pathSerializer: options.pathSerializer,
    headers: options.headers,
    parseAs: options.parseAs,
    middleware: options.middleware,
  });
}

export function listItems(options: WrapperOptions) {
  return makeClient(options).GET("/items", { params: { query: undefined }, body: undefined });
}

export function listAllItems(options: WrapperOptions) {
  return makeClient(options).GET("/items", { params: undefined });
}

/** The options of a Fetch API implementation with its own types, such as `undici`. */
export type CustomFetchOptions = {
  fetch?: (input: string) => Promise<object>;
  Request?: new (input: string, init: never) => object;
  FormData?: new () => object;
};

export function makeCustomFetchClient(options: CustomFetchOptions) {
  return createClient<Paths>({
    fetch: options.fetch,
    Request: options.Request,
    FormData: options.FormData,
  });
}
