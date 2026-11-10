---
"openapi-typesafe-react-query": patch
---

Two requests no longer share a cache entry: the init in a query key has its `headers` as a plain
object of the names and values they send (a `Headers` object hashed as `{}` before), a
`URLSearchParams`, `FormData`, `Blob` or bytes body by its content (hashed as `{}` before too), and
the `baseUrl` of the fetch client, so two clients with different base URLs get their own entries.
`createClient(fetchClient, { keyScope })` puts a name for the API in the keys instead of the base
URL: give the server and the browser the same one when they reach the API by different URLs, so
the browser reads the data the server rendered.
Read keys from `queryOptions(...).queryKey`; `[method, path]` still matches every query. Each
request is sent with the init of its own call, and stops when the query is cancelled also when the
init has its own `signal`. `useQuery` with an `initialData` that is never `undefined` types `data`
as defined, as TanStack Query does.
