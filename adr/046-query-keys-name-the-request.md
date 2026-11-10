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
- A query without an init and one with an empty init now share an entry: they send the same
  request.
- `Client` of the fetch client has a new required property, `baseUrl`; a hand-made object typed
  as `Client` must add it.

## Review trigger

A report of two queries that share an entry while their requests differ in something a key can
hold.
