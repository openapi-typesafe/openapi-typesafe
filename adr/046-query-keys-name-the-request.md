# ADR-046: Query keys name the request

- Status: Accepted
- Date: 2026-11-10

## Context

TanStack Query keeps one cache entry per query key, which it hashes as JSON. The hooks of
openapi-react-query use `[method, path, init]` as the key and send the request from the key.
The audit of rc.4 found three ways two different requests shared one entry, so that a component
got another request's data:

- `headers` given as a `Headers` object hash as `{}`, and header pairs by their order;
- a function in the init (`fetch`, `middleware`, a serializer) hashes as nothing;
- two fetch clients with different `baseUrl`s use the same keys.

The `signal` of the init was also mishandled: `useQuery` sent the init's signal instead of
TanStack Query's, so a cancelled query kept its request, and `useInfiniteQuery` the other way
round.

## Decision

1. The init in a key is the init of the call with its `headers` written as the plain object of
   names and values they send (a `Headers` object and pairs; a plain object stays as it is,
   since its `null` and array values mean more), and the `baseUrl` of the fetch client when the
   init has none. The `signal` is left out. Without an init and a `baseUrl` the key stays
   `[method, path]`.
2. The fetch client exposes its `baseUrl` (without a trailing slash, `""` without one) as a
   read-only property, so the hooks can read it.
3. Every request is sent with the init of the call that made the query options, as
   `useInfiniteQuery` already did; the key only names the cache entry. A function in the init
   therefore works, but it cannot be part of the key: queries that differ only in a function
   share an entry. The docs say to set such functions on the fetch client.
4. The request's signal aborts when TanStack Query's signal or the init's own one does.
5. `useQuery` with an `initialData` that is never `undefined` returns `DefinedUseQueryResult`, and
   `queryOptions` keeps the type of `initialData`, as TanStack Query does.

## Alternatives

- **Forbid functions and `signal` in the init types of the query hooks.** Rejected: generic
  wrappers that type the init as `FetchOptions<…>` (supported since rc.3, ADR-030) would no
  longer compile, since `FetchOptions` has those fields.
- **Give each function an id in the key.** Rejected: a function written inline gets a new id on
  every render, which makes a new cache entry and a new request each time.
- **Leave the base URL out and document one client per `QueryClient`.** Rejected: a key must name
  the data, and the wrong data shows with no error.
- **`AbortSignal.any`** for the signals. Rejected: Safari has it only since 17.4; two listeners do
  the same everywhere.

## Consequences

- A key written out by hand (`["get", "/pets"]`) no longer matches a query of a client with a
  `baseUrl`; `[method, path]` still matches as a prefix. The migration guide says to read keys
  from `queryOptions(...).queryKey`.
- A query without an init and one with an empty init now share an entry when the client has a
  `baseUrl`: they send the same request. Without one they did not (the amendment below fixes it).
- `Client` of the fetch client has a new required property, `baseUrl`; a hand-made object typed
  as `Client` must add it.

## Amendment (2026-11-10): bodies, header pairs, a key scope and initial data

The recheck of the rc.5 fixes found five more gaps.

1. **Bodies.** A `URLSearchParams`, `FormData`, `Blob` or `ArrayBuffer` body hashed as `{}`, so
   two searches with different bodies shared an entry. The key now holds such a body by its
   content, under its kind: a URLSearchParams as its text, a FormData as its fields, bytes as
   numbers. A Blob's bytes cannot be read while the component renders, so a Blob or a File is
   held by its type, size, name and date; two Blobs that differ only in their bytes share an
   entry, which the docs say. A body's kind is told as the fetch client tells it (ADR-030): the
   platform's global class or the type tag.
2. **Header pairs.** The key read pairs through `new Headers`, which threw for an invalid name or
   value while the component rendered, so the component crashed instead of the query failing.
   The pairs are now read without `Headers`, with its rules for names and repeated names; the
   request reports the invalid header as the query's error.
3. **Key scope.** With the base URL in every key, a page the server rendered with an internal URL
   was not found by the browser, which uses another URL, so it fetched again and the first render
   did not match the server's. Clients of one base URL that differ in their own headers (one per
   tenant) shared entries. `createClient` takes `{ keyScope }`, a name for the API that the keys
   hold in place of the base URL. The base URL stays the default: two APIs with the same paths
   in one `QueryClient` must not show each other's data, which no error shows, while a missed
   server render shows as a second request.
4. **Empty init.** The key leaves out its init when nothing is left in it, so a call without an
   init and one with `{}` share an entry also without a `baseUrl`.
5. **Initial data.** `queryOptions` kept the type of `initialData` as written. A literal such as
   `[{ id: 1 }]` lacks the optional properties of the data type, and TanStack Query's `useQuery`
   then did not take the options as having defined initial data. A defined `initialData` is now
   typed as the query data, as TanStack's `DefinedInitialDataOptions` types it.

| Option | Pros | Cons |
| --- | --- | --- |
| A `keyScope` option, the base URL by default (chosen) | Safe default; one name covers server rendering and tenants | One more option |
| No base URL in keys | Server rendering works with no option | Two APIs with the same paths show each other's data |
| The client's headers in keys | Tenants need no option | Tokens in keys and in the server-rendered page; a new token refetches everything |
| An id per Blob | Blobs never share an entry | A Blob built while rendering makes a new entry and a new request on every render |

A HEAD operation that declares response content keeps that type for `data`, which is `null`:
taking the content out of the operation's types broke wrappers that name the response type of a
HEAD operation (`FetchResponse<paths[P]["head"], …>`, ADR-030). The docs say to declare HEAD
responses without content.

## Review trigger

A report of two queries that share an entry while their requests differ in something a key can
hold.
