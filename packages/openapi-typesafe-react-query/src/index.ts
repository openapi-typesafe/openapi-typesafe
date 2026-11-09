import {
  type DataTag,
  type DefaultError,
  type InfiniteData,
  type QueryClient,
  type QueryFunctionContext,
  type SkipToken,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
// The helper types come from the client, which declares them: types inferred from the hooks then
// print the client, a peer every user has, and not `openapi-typesafe-helpers`, which Yarn PnP does
// not let a library reach (ADR-034).
import type {
  ClientMethod,
  DefaultParamsOption,
  Client as FetchClient,
  FetchResponse,
  HttpMethod,
  MaybeOptionalInit,
  MediaType,
  PathOperation,
  PathsWithMethod,
  RequiredKeysOf,
} from "openapi-typesafe-fetch";

// Helper type to dynamically infer the type from the `select` property
type InferSelectReturnType<TData, TSelect> = TSelect extends (data: TData) => infer R ? R : TData;

/**
 * Query data of a response type: a success without a body is `undefined` in the fetch client and
 * `null` in the query, as `queryFn` resolves it (upstream #2234, #2464).
 */
type QueryData<Data> = undefined extends Data ? Exclude<Data, undefined> | null : Data;

/**
 * What the hooks throw when a request fails and the response has no error body: a non-OK status
 * with an empty body, a JSON `null` body, or one whose operation declares no content for it. The
 * fetch client gives `error: undefined` (or `null`) then; throwing that left `error` empty in
 * TanStack Query while its type said there was an error body. Tell it apart with
 * `isResponseError(error)`: `error instanceof Error` also matches a network or parse error. The
 * message names the status, not the URL, which can carry secrets.
 */
export interface ResponseError extends Error {
  readonly name: "ResponseError";
  /** The response that failed. */
  readonly response: Response;
  /** Its HTTP status, as `response.status`. */
  readonly status: number;
}

/**
 * The error of a hook: the error body of a failed response, a `ResponseError` when it has none, or
 * what the request threw before there was a response to read: a network error (`TypeError`), an
 * abort, a body that is not JSON (`SyntaxError`) or a middleware error. TanStack Query types that
 * last part as `DefaultError` (`Error` unless `Register` says otherwise; a registered `unknown`
 * makes the whole type `unknown`, as for TanStack's own hooks). `undefined` and `null` are left
 * out: a failed response without an error body throws a `ResponseError`.
 */
export type QueryError<ErrorBody> =
  | Exclude<ErrorBody, undefined | null>
  | ResponseError
  | DefaultError;

/**
 * An object whose `queryKey` is tagged with the query's data and error types: the type that
 * TanStack Query 5.102 exports as `QueryKeyWithDataTag`, for the whole peer range. A named object
 * type, so the declarations of an exported `queryOptions` result print it by name. Spelled out,
 * the tag prints TanStack's `dataTagSymbol` keys, which a declaration file cannot import, and
 * the library's users get TS2304, or `any` cached data with `skipLibCheck`.
 */
export type QueryKeyWithDataTag<Key, Data, Error> = {
  queryKey: DataTag<Key, Data, Error>;
};

type InitWithUnknowns<Init> = Init & { [key: string]: unknown };

/**
 * The arguments after the path: the init, required when the operation requires a parameter or a
 * body, then `Rest`. The condition is openapi-react-query's, as `InitParam` of the fetch client
 * is openapi-fetch's (ADR-030, decision 2): TypeScript relates two conditional types only when
 * their `extends` types are the same, so a hook type copied from openapi-react-query takes these
 * hooks. For a union of inits, `MaybeOptionalInit` leaves out `undefined` when one is required,
 * so `Parameters<typeof $api.queryOptions>` still requires it then (upstream #2178).
 */
type InitArguments<Init, Rest extends unknown[]> =
  RequiredKeysOf<Init> extends never
    ? [InitWithUnknowns<Init>?, ...Rest]
    : [InitWithUnknowns<Init>, ...Rest];

export type QueryKey<
  Paths extends {},
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init = MaybeOptionalInit<Paths[Path], Method>,
> = Init extends undefined ? readonly [Method, Path] : readonly [Method, Path, Init];

/**
 * The last element of an infinite query's key. `useQuery` and `useInfiniteQuery` cache different
 * data (`TData` and `InfiniteData<TData>`), so the same request must not share one key (upstream
 * #2184, ADR-022). A prefix such as `[method, path]` still matches both. Not exported: a runtime
 * named export next to the default export would change what `require()` returns.
 */
const INFINITE_QUERY_KEY_MARKER = "infinite";

export type InfiniteQueryKey<
  Paths extends {},
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
> = readonly [...QueryKey<Paths, Method, Path>, typeof INFINITE_QUERY_KEY_MARKER];

export type QueryOptionsFunction<Paths extends {}, Media extends MediaType> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
  // note: Required is used to avoid repeating NonNullable in UseQuery types
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>,
  Options extends Omit<
    UseQueryOptions<
      QueryData<Response["data"]>,
      QueryError<Response["error"]>,
      InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
      QueryKey<Paths, Method, Path>
    >,
    "queryKey" | "queryFn"
  >,
>(
  method: Method,
  path: Path,
  ...[init, options]: InitArguments<Init, [Options?]>
) => NoInfer<
  Omit<
    UseQueryOptions<
      QueryData<Response["data"]>,
      QueryError<Response["error"]>,
      InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
      QueryKey<Paths, Method, Path>
    >,
    "queryFn" | "queryKey"
  > &
    QueryKeyWithDataTag<
      QueryKey<Paths, Method, Path>,
      QueryData<Response["data"]>,
      QueryError<Response["error"]>
    > & {
      queryFn: Exclude<
        UseQueryOptions<
          QueryData<Response["data"]>,
          QueryError<Response["error"]>,
          InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
          QueryKey<Paths, Method, Path>
        >["queryFn"],
        SkipToken | undefined
      >;
    }
>;

export type UseQueryMethod<Paths extends {}, Media extends MediaType> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
  // note: Required is used to avoid repeating NonNullable in UseQuery types
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>,
  Options extends Omit<
    UseQueryOptions<
      QueryData<Response["data"]>,
      QueryError<Response["error"]>,
      InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
      QueryKey<Paths, Method, Path>
    >,
    "queryKey" | "queryFn"
  >,
>(
  method: Method,
  url: Path,
  ...[init, options, queryClient]: InitArguments<Init, [Options?, QueryClient?]>
) => UseQueryResult<
  InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
  QueryError<Response["error"]>
>;

/**
 * The type of the page params: the initial one and the ones `getNextPageParam` and
 * `getPreviousPageParam` return (upstream #2458). It was `unknown`. It stays `unknown` when a
 * return type is untyped, so code that compiled still compiles (roadmap §3): TypeScript cannot
 * infer the return type of a callback that computes it from an unannotated `lastPageParam`,
 * whose type depends on that return type, and gives `never` or `unknown`.
 */
type PageParam<Initial, Next, Previous> =
  IsUntyped<Next> extends true
    ? unknown
    : [Previous] extends [NoPreviousPageParam]
      ? NullishToUnknown<Initial | NonNullable<Next>>
      : IsUntyped<Previous> extends true
        ? unknown
        : NullishToUnknown<Initial | NonNullable<Next> | NonNullable<Previous>>;

/** The `Previous` type parameter when the options have no `getPreviousPageParam`. */
declare const NO_PREVIOUS_PAGE_PARAM: unique symbol;
type NoPreviousPageParam = typeof NO_PREVIOUS_PAGE_PARAM;

type IsUntyped<T> = [T] extends [never] ? true : unknown extends T ? true : false;

/** Only `undefined` or `null` names no type: a cursor API's `initialPageParam: undefined`. */
type NullishToUnknown<T> = [T] extends [undefined | null] ? unknown : T;

/** Read only for the return type; `never` arguments add no inference for TanStack's page param. */
type PageParamFunction<Result> = (...args: never) => Result;

/**
 * Inference sites of the page param types. Intersected before `Options`, so TanStack's own
 * inference in the implementation reads the full signatures of `Options`.
 */
interface PageParamSources<Initial, Next, Previous> {
  initialPageParam: Initial;
  getNextPageParam: PageParamFunction<Next>;
  getPreviousPageParam?: PageParamFunction<Previous>;
}

/**
 * `placeholderData` of `useInfiniteQuery`, with an `unknown` page param as before: TypeScript types
 * a `(previousData) => previousData` callback while it still infers the page param, so it got
 * `unknown` there and failed against the typed page param.
 */
type InfinitePlaceholderData<
  Data,
  Error,
  Paths extends {},
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
> = UseInfiniteQueryOptions<
  Data,
  Error,
  InfiniteData<Data, unknown>,
  InfiniteQueryKey<Paths, Method, Path>,
  unknown
>["placeholderData"];

export type UseInfiniteQueryMethod<Paths extends {}, Media extends MediaType> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>,
  Options extends Omit<
    UseInfiniteQueryOptions<
      Response["data"],
      QueryError<Response["error"]>,
      InferSelectReturnType<
        InfiniteData<Response["data"], PageParam<Initial, Next, Previous>>,
        Options["select"]
      >,
      InfiniteQueryKey<Paths, Method, Path>,
      PageParam<Initial, Next, Previous>
    >,
    "queryKey" | "queryFn" | "placeholderData"
  > & {
    placeholderData?: InfinitePlaceholderData<
      Response["data"],
      QueryError<Response["error"]>,
      Paths,
      Method,
      Path
    >;
    pageParamName?: string;
  },
  Initial = unknown,
  Next = never,
  Previous = NoPreviousPageParam,
  // biome-ignore lint/complexity/useMaxParams: public signature of 1.x (ADR-036)
>(
  method: Method,
  url: Path,
  init: InitWithUnknowns<Init>,
  options: PageParamSources<Initial, Next, Previous> & Options,
  queryClient?: QueryClient,
) => UseInfiniteQueryResult<
  InferSelectReturnType<
    InfiniteData<Response["data"], PageParam<Initial, Next, Previous>>,
    Options["select"]
  >,
  QueryError<Response["error"]>
>;

export type UseSuspenseQueryMethod<Paths extends {}, Media extends MediaType> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
  // note: Required is used to avoid repeating NonNullable in UseQuery types
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>,
  Options extends Omit<
    UseSuspenseQueryOptions<
      QueryData<Response["data"]>,
      QueryError<Response["error"]>,
      InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
      QueryKey<Paths, Method, Path>
    >,
    "queryKey" | "queryFn"
  >,
>(
  method: Method,
  url: Path,
  ...[init, options, queryClient]: InitArguments<Init, [Options?, QueryClient?]>
) => UseSuspenseQueryResult<
  InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
  QueryError<Response["error"]>
>;

export type UseMutationMethod<Paths extends {}, Media extends MediaType> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
  // note: Required is used to avoid repeating NonNullable in UseQuery types
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>,
  TOnMutateResult = unknown,
>(
  method: Method,
  url: Path,
  options?: Omit<
    UseMutationOptions<Response["data"], QueryError<Response["error"]>, Init, TOnMutateResult>,
    "mutationKey" | "mutationFn"
  >,
  queryClient?: QueryClient,
) => UseMutationResult<Response["data"], QueryError<Response["error"]>, Init, TOnMutateResult>;

export interface OpenapiQueryClient<Paths extends {}, Media extends MediaType = MediaType> {
  queryOptions: QueryOptionsFunction<Paths, Media>;
  useQuery: UseQueryMethod<Paths, Media>;
  useSuspenseQuery: UseSuspenseQueryMethod<Paths, Media>;
  useInfiniteQuery: UseInfiniteQueryMethod<Paths, Media>;
  useMutation: UseMutationMethod<Paths, Media>;
}

export type MethodResponse<
  // biome-ignore lint/suspicious/noExplicitAny: matches a client of any paths, as upstream's
  CreatedClient extends OpenapiQueryClient<any, any>,
  Method extends HttpMethod,
  Path extends CreatedClient extends OpenapiQueryClient<infer Paths, infer _Media>
    ? PathsWithMethod<Paths, Method>
    : never,
  Options = object,
> =
  CreatedClient extends OpenapiQueryClient<
    // biome-ignore lint/suspicious/noExplicitAny: unknown rejects the generated interfaces
    infer Paths extends { [key: string]: any },
    infer Media extends MediaType
  >
    ? NonNullable<FetchResponse<Paths[Path][Method], Options, Media>["data"]>
    : never;

/** The `name` of every `ResponseError`. */
const RESPONSE_ERROR_NAME = "ResponseError";

/** The `ResponseError` of a failed response without an error body. */
class ResponseWithoutErrorBody extends Error implements ResponseError {
  override readonly name = RESPONSE_ERROR_NAME;
  readonly response: Response;
  readonly status: number;

  constructor(response: Response) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    super(`Request failed with status ${response.status}${statusText} and no error body`);
    this.response = response;
    this.status = response.status;
  }
}

/**
 * Whether `error` is the `ResponseError` of a failed response without an error body. It narrows a
 * hook's `error`, where `error instanceof Error` also matches network and parse errors. It checks
 * the `name`, not the class, so a `ResponseError` of another copy of this package (its CommonJS and
 * ES module builds loaded side by side) is one too. An error body from JSON is never an `Error`.
 */
export function isResponseError(error: unknown): error is ResponseError {
  return error instanceof Error && error.name === RESPONSE_ERROR_NAME;
}

/**
 * Throw the error of a failed fetch result. `if (error)` missed two failures: a non-OK response
 * with an empty body (`error` is `undefined`, upstream #2070, #2829) and a falsy error body such as
 * `0`. Without an error body a `ResponseError` is thrown, so the hooks' `error` is never
 * `undefined` (ADR-013, decision 3). A JSON `null` body is no error body either: thrown as is, it
 * left `error` `null` while the query's status was `"error"`.
 */
function throwIfFailed(result: { error?: unknown; response: Response }): void {
  if (result.error !== undefined && result.error !== null) {
    throw result.error;
  }
  if (!result.response.ok) {
    throw new ResponseWithoutErrorBody(result.response);
  }
}

/** The query parameter that carries the page param unless `pageParamName` names another. */
const DEFAULT_PAGE_PARAM_NAME = "cursor";

interface PageRequest {
  readonly pageParamName: string;
  readonly pageParam: unknown;
  readonly signal: AbortSignal;
}

/**
 * The request init of one page. An `undefined` page param (the first page with
 * `initialPageParam: undefined`) is left out instead of being sent as `0` (upstream #2715, #2340,
 * ADR-022), so a cursor API gets no cursor on the first page.
 */
function pageInit(init: unknown, { pageParamName, pageParam, signal }: PageRequest) {
  const { params, ...rest } = (init ?? {}) as { params?: { query?: DefaultParamsOption } };
  const page = pageParam === undefined ? {} : { [pageParamName]: pageParam };
  return { ...rest, signal, params: { ...params, query: { ...params?.query, ...page } } };
}

/**
 * Hooks and query options for a fetch client. A `QueryClient` other than the one from the React
 * context is passed to each hook as its last argument; `createClient` does not take one.
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: inherited, kept until 1.1 (ADR-036)
export default function createClient<Paths extends {}, Media extends MediaType = MediaType>(
  client: FetchClient<Paths, Media>,
): OpenapiQueryClient<Paths, Media> {
  const queryFn = async <Method extends HttpMethod, Path extends PathsWithMethod<Paths, Method>>({
    queryKey,
    signal,
  }: QueryFunctionContext<QueryKey<Paths, Method, Path>>) => {
    // While `Path` is generic, TypeScript cannot work out that the key is a tuple: the init is a
    // conditional type per operation (`MaybeOptionalInit`), and the key's type waits for it.
    const [method, path, init] = queryKey as readonly [Method, Path, unknown?];
    const mth = method.toUpperCase() as Uppercase<typeof method>;
    const fn = client[mth] as ClientMethod<Paths, typeof method, Media>;
    // The init is `unknown` here. An `any` init lets the call infer the generic response type
    // that `queryOptions` declares; a typed init makes TypeScript compare two unresolved
    // conditional types, which it cannot do.
    // biome-ignore lint/suspicious/noExplicitAny: see the comment above
    const result = await fn(path, { signal, ...(init as any) });
    throwIfFailed(result);
    // TanStack Query rejects `undefined` query data. The fetch client gives `undefined` for every
    // success without a body: a 204, `Content-Length: 0`, an empty chunked body, a HEAD request
    // (upstream #2234). A parsed body is never `undefined`, so this changes nothing else.
    return result.data ?? null;
  };

  const queryOptions: QueryOptionsFunction<Paths, Media> = (method, path, ...[init, options]) => ({
    queryKey: (init === undefined
      ? ([method, path] as const)
      : ([method, path, init] as const)) as DataTag<
      QueryKey<Paths, typeof method, typeof path>,
      // biome-ignore lint/suspicious/noExplicitAny: the declared return type sets the data type
      any,
      // biome-ignore lint/suspicious/noExplicitAny: the declared return type sets the error type
      any
    >,
    queryFn,
    ...options,
  });

  return {
    queryOptions,
    useQuery: (method, path, ...[init, options, queryClient]) =>
      useQuery(
        queryOptions(method, path, init as InitWithUnknowns<typeof init>, options),
        queryClient,
      ),
    useSuspenseQuery: (method, path, ...[init, options, queryClient]) =>
      useSuspenseQuery(
        queryOptions(method, path, init as InitWithUnknowns<typeof init>, options),
        queryClient,
      ),
    // biome-ignore lint/complexity/useMaxParams: public signature of 1.x (ADR-036)
    useInfiniteQuery: (method, path, init, options, queryClient) => {
      const { pageParamName = DEFAULT_PAGE_PARAM_NAME, placeholderData, ...restOptions } = options;
      const { queryKey } = queryOptions(method, path, init);
      const mth = method.toUpperCase() as Uppercase<typeof method>;
      const fn = client[mth] as ClientMethod<Paths, typeof method, Media>;
      return useInfiniteQuery(
        {
          queryKey: [...queryKey, INFINITE_QUERY_KEY_MARKER] as const,
          // The request comes from the arguments; the key only identifies the cache entry.
          queryFn: async ({ pageParam, signal }) => {
            const result = await fn(
              path,
              // biome-ignore lint/suspicious/noExplicitAny: a generic init; see queryFn
              pageInit(init, { pageParamName, pageParam, signal }) as any,
            );
            throwIfFailed(result);
            // An empty page stays `undefined`, as in upstream: TanStack Query rejects only
            // `undefined` query data, and the infinite query data is the `{ pages }` object.
            return result.data;
          },
          ...restOptions,
          // Typed with an `unknown` page param for the caller (`InfinitePlaceholderData`). TanStack
          // passes the previous data of this query, with its own page params, and takes it back.
          // biome-ignore lint/suspicious/noExplicitAny: TanStack's type carries its own page params
          placeholderData: placeholderData as any,
        },
        queryClient,
      );
    },
    useMutation: (method, path, options, queryClient) =>
      useMutation(
        {
          mutationKey: [method, path],
          mutationFn: async (init) => {
            const mth = method.toUpperCase() as Uppercase<typeof method>;
            const fn = client[mth] as ClientMethod<Paths, typeof method, Media>;
            const result = await fn(path, init as InitWithUnknowns<typeof init>);
            throwIfFailed(result);
            // TanStack Query accepts `undefined` mutation data, so a success without a body stays
            // `undefined`, as in upstream; only query data needs `null` (upstream #2234). The cast
            // only bridges the generic types: `Response["data"]` still has `undefined` for an
            // operation with a response without a body.
            const { data } = result;
            return data as Exclude<typeof data, undefined>;
          },
          ...options,
        },
        queryClient,
      ),
  };
}
