# openapi-typesafe-react-query

Typed TanStack Query v5 hooks on top of an openapi-typesafe-fetch client. Peer dependencies:
`@tanstack/react-query` 5.80+ and `openapi-typesafe-fetch`.

```bash
npm i openapi-typesafe-react-query openapi-typesafe-fetch @tanstack/react-query
npm i -D openapi-typesafe
```

## Setup

```ts
// src/api.ts
import createFetchClient from "openapi-typesafe-fetch";
import createClient from "openapi-typesafe-react-query";
import type { paths } from "./api/schema";

export const fetchClient = createFetchClient<paths>({ baseUrl: "https://api.example.com/v1" });
export const $api = createClient(fetchClient);
```

Middleware goes on `fetchClient` (`fetchClient.use(authMiddleware)`); the hooks use it.
The app still needs a `QueryClientProvider` from `@tanstack/react-query`.

## Hooks

The HTTP method is **lower-case** here, and the options object is the same as in
`client.GET(...)` (`params`, `body`, `headers`, ...).

```tsx
import { useQueryClient } from "@tanstack/react-query";

function PetPage({ petId }: { petId: number }) {
  const queryClient = useQueryClient();

  const { data, error, isPending } = $api.useQuery("get", "/pets/{petId}", {
    params: { path: { petId } },
  });

  const { data: pets } = $api.useSuspenseQuery("get", "/pets");

  const createPet = $api.useMutation("post", "/pets", {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["get", "/pets"] }),
  });
  const addRex = () => createPet.mutate({ body: { name: "Rex" } });

  const pages = $api.useInfiniteQuery(
    "get",
    "/pets",
    { params: { query: { limit: 20 } } },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      pageParamName: "cursor", // the query parameter that receives the page param; default "cursor"
    },
  );
  // render data, pets and pages; call addRex from a button
  return null;
}
```

Signatures:

- `useQuery(method, path, init?, options?, queryClient?)`; `useSuspenseQuery` takes the same.
- `useMutation(method, path, options?, queryClient?)`; `mutate(init)` takes `params` / `body`.
- `useInfiniteQuery(method, path, init, options, queryClient?)`; `options` needs
  `getNextPageParam` and `initialPageParam`. With `initialPageParam: undefined` (cursor APIs) the
  first request has no page param.
- Query options (`retry`, `enabled`, `select`) go in `options`, never in `init`: in `init` they
  compile and are ignored.
- `queryOptions(method, path, init?, options?)` returns options for any TanStack API:
  `useQueries`, `queryClient.fetchQuery`, `ensureQueryData`, `prefetchQuery`.

```ts
await queryClient.prefetchQuery($api.queryOptions("get", "/pets"));
const pets = queryClient.getQueryData($api.queryOptions("get", "/pets").queryKey); // typed
```

## Query keys

- Query key: `[method, path, init]`, where the key's init is the call's init with `headers` and
  `URLSearchParams` / `FormData` / `Blob` / bytes values (the whole body or inside an object body,
  such as a multipart `{ image: file }`, also a class instance; React Native FormData via
  `getParts` parts) as plain values, bytes inside a body as JSON sends them, a whole-body object
  with a `toJSON` also by its members (`bodyFields`), plus the fetch client's `baseUrl` (or
  `keyScope`). A `Date`, boxed primitive or `toJSON` value is held by its JSON form in a body and
  by the text the client sends in params and headers (ISO for a `Date`, `"NaN"` for `NaN`), so
  filters such as `setQueriesData({ queryKey })` match only that value's query. `undefined` fields, params and headers, and the `params` records they leave empty,
  are left out; `[method, path]` when nothing is left (no init, no `baseUrl`).
- `createClient(fetchClient, { keyScope: "blog" })`: the keys name the API instead of the base
  URL. Use it when server rendering uses another base URL than the browser, so the browser reads
  the server's data, and to tell apart clients of one base URL with different headers (tenants).
- Infinite query key: the same with `"infinite"` after it (type `InfiniteQueryKey`), so it never
  shares a cache entry with `useQuery`; the `[method, path]` prefix matches both. A
  `pageParamName` other than `"cursor"` follows as `{ pageParamName }`. Write it with
  `infiniteQueryKey($api.queryOptions(...).queryKey, pageParamName?)`, exported by the package:
  `[...queryKey, "infinite"]` is the same key but does not type-check as an `InfiniteQueryKey`.
- Mutation key: `[method, path]`.
- Invalidate every query of an endpoint with a prefix key:
  `queryClient.invalidateQueries({ queryKey: ["get", "/pets"] })`.
- Prefer `$api.queryOptions(...).queryKey` over a hand-written key for one exact query.

## Errors

A query or mutation fails on every non-OK response, also one without a body. The thrown value
is the typed error body of the operation, or a `ResponseError` (`name: "ResponseError"`,
`status`, `response`) when the response had no error body (none, or JSON `null`). So in the hook
result:

- `error` is set whenever the query failed; `if (error)` and `isError` agree;
- its type is the error body type (for example `{ code: string; message: string }`), or
  `ResponseError`, or TanStack Query's `DefaultError` (`Error`): network errors, aborts, a body
  that is not JSON and middleware errors reach `error` too;
- `isResponseError(error)` (a named export; with CommonJS a property of what `require()`
  returns) narrows to `ResponseError`; `error instanceof Error` is also true for a network error,
  so it does not prove there is a `status`;
- `ResponseError` itself is a type only (`import type`).

A `204` success gives `data: null` in queries.

## Mistakes

| Mistake | Fix |
| :-- | :-- |
| `$api.useQuery("GET", ...)` | Lower-case method: `"get"` |
| `$api.useQuery("get", "/pets/{petId}", { petId })` | `{ params: { path: { petId } } }` |
| `useMutation(...).mutate(pet)` | `mutate({ body: pet })` |
| `error.code` without narrowing | `if (isResponseError(error))` and `if (error instanceof Error)` first: a failure without an error body is a `ResponseError`, one without a response an `Error` |
| `error.status` after `error instanceof Error` | `isResponseError(error)`: a network or parse error is an `Error` without `status` |
| `error.name === "ResponseError"` | `isResponseError(error)`: an error body may have no `name`, and then this does not compile |
| `error.message` on a typed error body | Use the fields the document defines; `message` is the `Error`'s only when `error instanceof Error` |
| Wrapping `fetchClient.GET` in `useQuery` by hand | Use `$api.useQuery` or `$api.queryOptions`; they set the key, the signal and the error handling |
| Middleware registered on `$api` | Register it on the fetch client: `fetchClient.use(...)` |
