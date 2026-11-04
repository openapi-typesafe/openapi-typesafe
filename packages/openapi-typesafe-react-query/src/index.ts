import {
  type DataTag,
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
import type {
  ClientMethod,
  DefaultParamsOption,
  Client as FetchClient,
  FetchResponse,
  IsInitOptional,
  MaybeOptionalInit,
  PathOperation,
} from "openapi-typesafe-fetch";
import type { HttpMethod, MediaType, PathsWithMethod } from "openapi-typesafe-helpers";

// Helper type to dynamically infer the type from the `select` property
type InferSelectReturnType<TData, TSelect> = TSelect extends (data: TData) => infer R ? R : TData;

/**
 * Query data of a response type: a success without a body is `undefined` in the fetch client and
 * `null` in the query, as `queryFn` resolves it (upstream #2234, #2464).
 */
type QueryData<Data> = undefined extends Data ? Exclude<Data, undefined> | null : Data;

type InitWithUnknowns<Init> = Init & { [key: string]: unknown };

/**
 * The arguments after the path: the init, required when the operation requires a parameter or a
 * body, then `Rest`. `IsInitOptional` keeps the init optional in
 * `Parameters<typeof $api.queryOptions>`, where it is the union of all inits (upstream #2178).
 */
type InitArguments<Init, Rest extends unknown[]> =
  IsInitOptional<Init> extends true ? [InitWithUnknowns<Init>?, ...Rest] : [InitWithUnknowns<Init>, ...Rest];

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
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>, // note: Required is used to avoid repeating NonNullable in UseQuery types
  Options extends Omit<
    UseQueryOptions<
      QueryData<Response["data"]>,
      Response["error"],
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
      Response["error"],
      InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
      QueryKey<Paths, Method, Path>
    >,
    "queryFn" | "queryKey"
  > & {
    queryKey: DataTag<QueryKey<Paths, Method, Path>, QueryData<Response["data"]>, Response["error"]>;
    queryFn: Exclude<
      UseQueryOptions<
        QueryData<Response["data"]>,
        Response["error"],
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
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>, // note: Required is used to avoid repeating NonNullable in UseQuery types
  Options extends Omit<
    UseQueryOptions<
      QueryData<Response["data"]>,
      Response["error"],
      InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
      QueryKey<Paths, Method, Path>
    >,
    "queryKey" | "queryFn"
  >,
>(
  method: Method,
  url: Path,
  ...[init, options, queryClient]: InitArguments<Init, [Options?, QueryClient?]>
) => UseQueryResult<InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>, Response["error"]>;

/**
 * The type of the page params: the initial one and the ones `getNextPageParam` and
 * `getPreviousPageParam` return (upstream #2458). It was `unknown`. It stays `unknown` when a
 * return type is untyped, so code that compiled still compiles (roadmap §3): TypeScript cannot
 * infer the return type of a callback that computes it from an unannotated `lastPageParam`,
 * whose type depends on that return type, and gives `never` or `unknown`.
 */
type PageParam<Options, Initial, Next, Previous> =
  IsUntyped<Next> extends true
    ? unknown
    : "getPreviousPageParam" extends keyof Options
      ? IsUntyped<Previous> extends true
        ? unknown
        : NullishToUnknown<Initial | NonNullable<Next> | NonNullable<Previous>>
      : NullishToUnknown<Initial | NonNullable<Next>>;

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

export type UseInfiniteQueryMethod<Paths extends {}, Media extends MediaType> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>,
  Options extends Omit<
    UseInfiniteQueryOptions<
      Response["data"],
      Response["error"],
      InferSelectReturnType<
        InfiniteData<Response["data"], PageParam<Options, Initial, Next, Previous>>,
        Options["select"]
      >,
      InfiniteQueryKey<Paths, Method, Path>,
      PageParam<Options, Initial, Next, Previous>
    >,
    "queryKey" | "queryFn"
  > & {
    pageParamName?: string;
  },
  Initial = unknown,
  Next = never,
  Previous = never,
>(
  method: Method,
  url: Path,
  init: InitWithUnknowns<Init>,
  options: PageParamSources<Initial, Next, Previous> & Options,
  queryClient?: QueryClient,
) => UseInfiniteQueryResult<
  InferSelectReturnType<InfiniteData<Response["data"], PageParam<Options, Initial, Next, Previous>>, Options["select"]>,
  Response["error"]
>;

export type UseSuspenseQueryMethod<Paths extends {}, Media extends MediaType> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>, // note: Required is used to avoid repeating NonNullable in UseQuery types
  Options extends Omit<
    UseSuspenseQueryOptions<
      QueryData<Response["data"]>,
      Response["error"],
      InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>,
      QueryKey<Paths, Method, Path>
    >,
    "queryKey" | "queryFn"
  >,
>(
  method: Method,
  url: Path,
  ...[init, options, queryClient]: InitArguments<Init, [Options?, QueryClient?]>
) => UseSuspenseQueryResult<InferSelectReturnType<QueryData<Response["data"]>, Options["select"]>, Response["error"]>;

export type UseMutationMethod<Paths extends {}, Media extends MediaType> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<Paths, Method>,
  Init extends MaybeOptionalInit<Paths[Path], Method>,
  Response extends Required<FetchResponse<PathOperation<Paths, Path, Method>, Init, Media>>, // note: Required is used to avoid repeating NonNullable in UseQuery types
  TOnMutateResult = unknown,
>(
  method: Method,
  url: Path,
  options?: Omit<
    UseMutationOptions<Response["data"], Response["error"], Init, TOnMutateResult>,
    "mutationKey" | "mutationFn"
  >,
  queryClient?: QueryClient,
) => UseMutationResult<Response["data"], Response["error"], Init, TOnMutateResult>;

export interface OpenapiQueryClient<Paths extends {}, Media extends MediaType = MediaType> {
  queryOptions: QueryOptionsFunction<Paths, Media>;
  useQuery: UseQueryMethod<Paths, Media>;
  useSuspenseQuery: UseSuspenseQueryMethod<Paths, Media>;
  useInfiniteQuery: UseInfiniteQueryMethod<Paths, Media>;
  useMutation: UseMutationMethod<Paths, Media>;
}

export type MethodResponse<
  CreatedClient extends OpenapiQueryClient<any, any>,
  Method extends HttpMethod,
  Path extends CreatedClient extends OpenapiQueryClient<infer Paths, infer _Media>
    ? PathsWithMethod<Paths, Method>
    : never,
  Options = object,
> =
  CreatedClient extends OpenapiQueryClient<infer Paths extends { [key: string]: any }, infer Media extends MediaType>
    ? NonNullable<FetchResponse<Paths[Path][Method], Options, Media>["data"]>
    : never;

/**
 * Throw the error of a failed fetch result. `if (error)` missed two failures: a non-OK response with
 * an empty body (`error` is `undefined`, upstream #2070, #2829) and a falsy error body such as `0`.
 */
function throwIfFailed(result: { error?: unknown; response: Response }): void {
  if (result.error !== undefined || !result.response.ok) {
    throw result.error;
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

// TODO: Add the ability to bring queryClient as argument
export default function createClient<Paths extends {}, Media extends MediaType = MediaType>(
  client: FetchClient<Paths, Media>,
): OpenapiQueryClient<Paths, Media> {
  const queryFn = async <Method extends HttpMethod, Path extends PathsWithMethod<Paths, Method>>({
    queryKey: [method, path, init],
    signal,
  }: QueryFunctionContext<QueryKey<Paths, Method, Path>>) => {
    const mth = method.toUpperCase() as Uppercase<typeof method>;
    const fn = client[mth] as ClientMethod<Paths, typeof method, Media>;
    const result = await fn(path, { signal, ...(init as any) }); // TODO: find a way to avoid as any
    throwIfFailed(result);
    // TanStack Query rejects `undefined` query data. The fetch client gives `undefined` for every
    // success without a body: a 204, `Content-Length: 0`, an empty chunked body, a HEAD request
    // (upstream #2234). A parsed body is never `undefined`, so this changes nothing else.
    return result.data ?? null;
  };

  const queryOptions: QueryOptionsFunction<Paths, Media> = (method, path, ...[init, options]) => ({
    queryKey: (init === undefined ? ([method, path] as const) : ([method, path, init] as const)) as DataTag<
      QueryKey<Paths, typeof method, typeof path>,
      any,
      any
    >,
    queryFn,
    ...options,
  });

  return {
    queryOptions,
    useQuery: (method, path, ...[init, options, queryClient]) =>
      useQuery(queryOptions(method, path, init as InitWithUnknowns<typeof init>, options), queryClient),
    useSuspenseQuery: (method, path, ...[init, options, queryClient]) =>
      useSuspenseQuery(queryOptions(method, path, init as InitWithUnknowns<typeof init>, options), queryClient),
    useInfiniteQuery: (method, path, init, options, queryClient) => {
      const { pageParamName = DEFAULT_PAGE_PARAM_NAME, ...restOptions } = options;
      const { queryKey } = queryOptions(method, path, init);
      const mth = method.toUpperCase() as Uppercase<typeof method>;
      const fn = client[mth] as ClientMethod<Paths, typeof method, Media>;
      return useInfiniteQuery(
        {
          queryKey: [...queryKey, INFINITE_QUERY_KEY_MARKER] as const,
          // The request comes from the arguments; the key only identifies the cache entry.
          queryFn: async ({ pageParam, signal }) => {
            const result = await fn(path, pageInit(init, { pageParamName, pageParam, signal }) as any);
            throwIfFailed(result);
            return result.data;
          },
          ...restOptions,
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
            const { data } = result;

            return data as Exclude<typeof data, undefined>;
          },
          ...options,
        },
        queryClient,
      ),
  };
}
