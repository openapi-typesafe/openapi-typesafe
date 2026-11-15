---
title: useQuery
description: Typed useQuery for OpenAPI endpoints
---
# {{ $frontmatter.title }}

The `useQuery` method allows you to use the original [useQuery](https://tanstack.com/query/latest/docs/framework/react/guides/queries).

- The result is the same as the original function.
- The query key is `[method, path, options]`, so `[method, path]` matches every variant in
  `invalidateQueries`. `options` is the `init` object, such as `{ params: { path: { id: 1 } } }`,
  with changes that keep every request in its own cache entry: `headers` given as a `Headers`
  object or as pairs are written as a plain object of the names and values they send; a value
  that JSON cannot hold is written by its content (a `URLSearchParams` as its text, a `FormData`
  as its fields, bytes as numbers) or, for a `Blob` or a `File`, by its type, size and name, so
  two Blobs that differ only in their bytes share an entry. A React Native `FormData`, which has
  no `entries`, is written as the parts of its `getParts`, which React Native sends: each with its
  `fieldName` and its text, or the `uri`, `name` and `type` of a file. This holds for the whole
  body and for such a value anywhere inside an object or array body, as in a multipart body
  written as `{ image: file }`, except bytes: a typed array or an `ArrayBuffer` inside a body is
  written as JSON sends it (a `Uint16Array` as `{ "0": 256 }`), and only a whole bytes body by its
  bytes. An object body is written by its own enumerable members, as the fetch client sends it,
  also when it is a class instance or comes from another realm. A `Date`, a `Number`, `Boolean`
  or `String` object, or another object with a `toJSON` is written as its JSON form (what
  `toJSON` returns, or the primitive), not as the object: TanStack Query's filters compare
  objects by their own members, which a `Date` does not have, so `setQueriesData` with the key
  of one date would match the queries of every date. As the whole body, such an object with own
  members also has them in `bodyFields`, as `body` and `bodyType`: JSON sends its JSON form,
  while a form or multipart body sends its members. `NaN`, `Infinity` and `-Infinity` in a body
  are `null`, as JSON sends them, with their text as their kind, since a form or multipart body
  sends the text. An `undefined` item of an array body, also a hole, is `null`, which every body
  sends for it. A bigint in a body is its text, with the kind `"bigint"`: a form or multipart
  body sends the text, and JSON fails for it. The kinds go in `bodyType` beside the body:
  `"URLSearchParams"`, `"FormData"`, `"Blob"`, `"bytes"` or such a text for the whole body, or an
  object of them by member name or index (`{ image: "Blob" }`), so such a body never shares a key
  with a JSON body of the same shape. Parameter values (`params`) are written as the fetch client
  sends them: a valid `Date` (or another value with a `toISOString`) as its ISO text, `NaN`, the
  infinities and a bigint as their text under a name of its own, `{ "(number)": "NaN" }`, since
  a JSON `querySerializer` sends `NaN` as `null` and `"NaN"` as a string, an array by its items, with an `undefined` item (also a
  hole or a function) as `{ "(undefined)": true }`, which a `qs` serializer sends differently
  from `null`, and another object by its own members, which the default serializers send. The
  records themselves (`params`, `query`, `path`, `header`) are read the same way when they are
  not object literals, such as class instance DTOs. A `querySerializer` or `pathSerializer` set on the
  fetch client may send the object's `toJSON` form or its text instead, so the key also holds
  them, when the object has its own, under `"toJSON()"` and `"toString()"`: a `URL` is
  `{ "toJSON()": href, "toString()": href }`, a `Number` object `{ "toString()": "5" }` and an
  invalid date `{ "toJSON()": null, "toString()": "Invalid Date" }`. Two URLs, Temporal values
  or value objects with private fields therefore never share an entry. Plain `headers` values
  are written as the text `Headers` sends: `5` and `new Number(5)` as `"5"`, a `URL` as its
  href, a `Date` as its local text (`String(date)`, not the ISO text a header parameter sends),
  and an array as the text of each item. Header names, in plain `headers` and in
  `params.header`, are written in lower case, as `Headers` matches them in any case, and in
  their order: `{ "X-A": "1", "x-a": "2" }` sends and has the key `{ "x-a": "2" }`. A `Map`
  or a `Set`, in a body as in `params`, keeps its contents in none of its members, so JSON and
  the default serializers send `{}` or nothing for it, while a `querySerializer` or
  `bodySerializer` of yours may send the contents: the key holds them in order, a `Set` as
  `{ "values()": [...] }` and a `Map` as `{ "entries()": [[key, value], ...] }`. A value that
  is a `Map` or a `Set` by its type tag only, such as a MobX observable `Map` or `Set`, is its
  contents alone: its own members are its state, which MobX changes each time it is read. A
  `Map` or `Set` subclass keeps its own members beside its contents, as JSON sends them. Any
  other class instance is keyed by its own members, so an Immutable.js collection is keyed by
  its inner tree too; pass `toJS()` for a key of its contents alone. Other
  iterables are keyed by their own members only: an iterator would be used up by the key, and a
  class of yours may iterate without end; give such a value a `toJSON`. A `WeakMap`, `WeakSet`
  or `WeakRef` cannot be read by anyone, so it stays `{}`. The body, `params` and `headers` are
  read by one rule: a function is left out, in a body as JSON leaves it out (a function array
  item is `null`, as JSON sends it); a `toJSON`, `toString`, `toISOString` or getter that
  throws, a revoked `Proxy`, header pairs with an item that is no pair, and a member that
  refers back to an object it is in (a circular body) are left out of the key rather than crash
  the component; the request reports the error. A value more than 100 objects deep is read in
  parts, so its key does not depend on the JavaScript stack: an object below that depth is
  `{ "(deeper)": n }` in place, and the key's init lists those parts in order under
  `"(deeper)"`; ten thousand objects deep a part is its JSON text. Fields, parameters and
  headers set to `undefined` are left out, and so are `params`,
  its `query`, `path`, `header` and `cookie` records and `headers` that this leaves empty, since
  they send nothing: `{ params: { query: { cursor: undefined } } }` has the key of no init.
  A `null`, `[]` or `{}` parameter or header value stays, and so does an empty JSON body. The
  client's
  [`keyScope`](./index.md#query-keys-and-server-rendering), or else its `baseUrl` when the init
  has none, is added. When nothing is left, as without an init, the key is `[method, path]`. Read
  the key from `queryOptions(...).queryKey` for `setQueryData` and `getQueryData` rather than
  writing it out.
- The request is sent with the `init` of the call. A `fetch`, `middleware` or serializer in it is
  a function, which a query key cannot hold. The key leaves functions out, also the hooks of a
  `middleware` object and a function member of a body, so a filter with the key of a later
  render, which has a new inline function, still finds the query, and so does one after
  `hydrate`. Two queries that differ only
  in a function share a cache entry, so set those on the fetch client, or give the queries
  different params.
- The request stops when TanStack Query cancels the query, and also when a `signal` of the init
  aborts.
- With an `initialData` that is never `undefined`, `data` is never `undefined` either, as for
  TanStack Query's own `useQuery`.
- `data` and `error` are fully typed. `error` is the declared error body, a
  [`ResponseError`](./index.md#errors) when the response failed without one, or the `Error` of
  a request that got no response to read (a network or parse error). Tell them apart with
  `isResponseError(error)`.
- A successful response without a body (a 204, an empty body, any HEAD response) gives
  `data: null`: TanStack Query does not accept `undefined` query data. `useSuspenseQuery` and
  `queryOptions` do the same, and the types say so: the data of an operation with a 204 is
  `Body | null`, and `select` gets `null` too. A HEAD operation that declares content for a
  response keeps that type, as in the fetch client, although its `data` is always `null`:
  declare HEAD responses without content. `useInfiniteQuery` pages and `useMutation` data
  stay `undefined` for such a response, as in `openapi-react-query`: TanStack Query accepts
  them, and their types include `undefined`.
- You can pass query options as fourth parameter. Query options in the third parameter (the fetch
  options) are not read: `useQuery("get", "/me", { retry: false })` sends a request and keeps the
  default `retry`. Write `useQuery("get", "/me", undefined, { retry: false })`.

::: tip
You can find more information about `useQuery` on the [@tanstack/react-query documentation](https://tanstack.com/query/latest/docs/framework/react/guides/queries).
:::

## Example

::: code-group

```tsx [src/app.tsx]
import { $api } from "./api";

export const App = () => {
  const { data, error, isLoading } = $api.useQuery("get", "/users/{user_id}", {
    params: {
      path: { user_id: 5 },
    },
  });

  if (error) return `An error occurred: ${error.message}`;
  if (!data || isLoading) return "Loading...";

  return <div>{data.firstname}</div>;
};
```

```ts [src/api.ts]
import createFetchClient from "openapi-typesafe-fetch";
import createClient from "openapi-typesafe-react-query";
import type { paths } from "./my-openapi-3-schema"; // generated by openapi-typesafe

const fetchClient = createFetchClient<paths>({
  baseUrl: "https://myapi.dev/v1/",
});
export const $api = createClient(fetchClient);
```

:::

## Api

```tsx
const query = $api.useQuery(method, path, options, queryOptions, queryClient);
```

**Arguments**

- `method` **(required)**
  - The HTTP method to use for the request.
  - The method is used as key. See [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) for more information.
- `path` **(required)**
  - The pathname to use for the request.
  - Must be an available path for the given method in your schema.
  - The pathname is used as key. See [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) for more information.
- `options`
  - The fetch options to use for the request.
  - Only required if the OpenApi schema requires parameters.
  - The whole options object (`params`, `headers`, `body` and the rest) is part of the key. See [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys) for more information.
- `queryOptions`
  - The original `useQuery` options.
  - [See more information](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)
- `queryClient`
  - The original `queryClient` option.
  - [See more information](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)
