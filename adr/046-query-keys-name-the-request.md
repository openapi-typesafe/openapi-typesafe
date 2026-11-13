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

## Amendment (2026-11-10): the date of a File, the kind of a body, `undefined` fields

1. **The date of a File.** The key held a File's `lastModified`. `FormData.append` with a Blob and
   `new File` set it to the current time, so a FormData built while the component rendered got a
   new key on every render: a new request, a new render, and so on without end. A File is now
   held by its type, size and name only.
2. **The kind of a body.** A raw body was written under its kind (`{ bytes: [...] }`), the same
   shape as a JSON body with that member, so the two shared an entry. The key now holds the
   content as `body` and its kind in `bodyType`, a field that no init has, so a JSON body keeps
   its key and never matches a raw one.
3. **`undefined` fields.** An init whose fields are all `undefined` (`headers: token ? {...} :
   undefined`) sends the same request as none, but its key kept an empty init. Such fields are
   now left out before the init counts as empty.

## Amendment (2026-11-11): values inside a body, records that send nothing

1. **Values inside a body.** Only a raw body as a whole was held by its content. A multipart body
   written as an object (`{ image: file }`, which the fetch client turns into FormData) held its
   File as `{}`, so every file had one key and a second file showed the result of the first.
   The body is now written member by member, through objects and arrays, with every
   URLSearchParams, FormData, Blob and bytes value by its content, as for a raw body. `bodyType`
   names the kinds out of band: a string for a raw body, or for an object or array body an
   object of the kinds by member name or index, only where there are such values. A JSON body has
   no `bodyType`, so it never matches a body that holds such a value written as the same JSON. An
   empty object or array in a body stays: a JSON `{}` is a body, unlike none.
2. **Records that send nothing.** Only top-level `undefined` fields were left out, so
   `{ params: { query: { cursor: undefined } } }`, `{ params: {} }` and
   `{ headers: { "X-Tenant": undefined } }` sent the request of no init under another key. In
   `params`, its records (`query`, `path`, `header`, `cookie`) and `headers`, members set to
   `undefined` are now left out, and a record or `headers` left empty goes too. This merges no
   requests that differ: TanStack Query's hash already left out `undefined` members, and the fetch
   client reads a missing `params`, record or `headers` as an empty one. A `null`, `[]` or `{}`
   parameter or header value stays: `null` removes a header the client sets, and a
   `querySerializer` of the fetch client, which the key cannot see, may send them. With the
   default serializer such a query value sends nothing, so it costs one more request, while
   leaving it out could show one request's data for another.

| Option | Pros | Cons |
| --- | --- | --- |
| Kinds out of band in `bodyType`, by place (chosen) | No JSON body matches; a raw body's key is unchanged | `bodyType` has two shapes |
| A tag inside the body at each raw value | One shape | A JSON body with the tag's members matches |
| Leave out `null` and `[]` query values too | Exact for the default serializer | A custom serializer's different requests share an entry |

## Amendment (2026-11-12): body objects, React Native FormData, `pageParamName`

1. **Body objects that are not literals.** The key walked only object literals. A multipart body
   written as a class instance (a form DTO), an `Object.create` object or an object of another
   realm kept its File as `{}`, while the fetch client sends every own enumerable member of any
   object (`Object.entries`). The key now walks every object body by its own enumerable members,
   the members both `JSON.stringify` and the multipart body send. The raw kinds keep their own
   rule, checked first, and so does an object with a `toJSON` (a Date): JSON sends what `toJSON`
   returns, so the key keeps the value. (Corrected by the second amendment of 2026-11-12: a form
   or multipart body sends the own members of such an object, not its `toJSON` form, so "both
   send the same members" holds only for objects without a `toJSON`.) Keys of object literals,
   arrays and raw bodies are unchanged; a class-instance JSON body now hashes by sorted member names, as a literal does.
   `params` stays limited to object literals: the fetch client reads only their records.
2. **React Native FormData.** React Native's FormData has `append`, `getAll` and `getParts`, and
   no `entries`, so every such body had the fields `[]` and one key per path. Its fields are now
   the parts `getParts` gives, which React Native's network layer sends: plain objects with the
   `fieldName`, the part `headers`, and the text as `string` or the members of the appended file
   object (`uri`, `name`, `type`). They are kept as they are rather than turned into
   `[name, value]` pairs: the pairs would only repeat them, and the bundle stays within its size
   limit. A FormData with neither method keeps `[]`.
3. **`pageParamName`.** The infinite key left out `pageParamName`, which names the query
   parameter of every page, so two queries that differed only in it shared an entry. A name other
   than the default `"cursor"` now follows the marker: `[method, path, init, "infinite",
   { pageParamName }]`. The default adds nothing, so the keys of calls without the option, which
   are most calls, stay as they were, and naming `"cursor"` gives the same key as leaving it out,
   since it sends the same requests. `InfiniteQueryKey` is the union of the two shapes.

| Option | Pros | Cons |
| --- | --- | --- |
| `{ pageParamName }` after the marker, only for another name (chosen) | Default keys unchanged; a `[..., "infinite"]` prefix matches all | Two key shapes |
| `pageParamName` in the key's init | One shape | The init would hold a field no request init has |
| The name always after the marker | One shape | Every infinite key changes |

## Amendment (2026-11-12, second): JSON forms, bytes inside a body, the infinite key's type

The rule, restated: a key differs exactly when the request differs, judged by what the fetch
client's default body serializer sends.

1. **`Number`, `Boolean` and `String` objects.** Walked by their members since the first
   amendment of 2026-11-12, `new Number(1)` and `new Number(2)` both had the body `{}`, and
   `new String("ab")` had `{ "0": "a", "1": "b" }`, while JSON sends `1`, `2` and `"ab"`. They are
   now kept as they are, like an object with a `toJSON`, and TanStack Query's hash writes them as
   JSON does. They are told by their class or type tag, so a `Number` of another realm counts.
2. **An object with a `toJSON` as a form or multipart body.** The key held only the `toJSON`
   form, while the form and multipart serializers send the object's own members
   (`Object.entries`). Two upload forms of different files shared an entry. The key cannot see
   a `Content-Type` or a `bodySerializer` set on the fetch client, so for a whole body of its own
   JSON form with own members it holds both: the JSON form as `body`, and the members, keyed as
   any object body is, as `bodyFields` (`{ body, bodyType }`). A Date has no own members and
   keeps its key. Inside a body nothing changes: a form or multipart body rejects a nested
   object other than a Date, so only JSON sends one.
3. **Bytes inside a body.** A typed array inside a body was keyed by its bytes, so
   `{ a: new Uint8Array([0, 1]) }` and `{ a: new Uint16Array([256]) }` shared an entry, while JSON
   sends `{"0":0,"1":1}` and `{"0":256}`. Bytes are only what is sent for a whole raw body, which
   keeps its key. Inside a body they are now walked by their members like any other object, which
   is what JSON writes; an `ArrayBuffer` and a `DataView` there are `{}`, as JSON sends them. The
   form and multipart serializers reject such a member, so JSON is the only case. Its `"bytes"`
   kind in `bodyType` goes away.
4. **The infinite key's type.** `[...queryOptions(...).queryKey, "infinite"]` is the documented
   key, but it did not type-check as `InfiniteQueryKey` (TS2322): the `queryKey` carries
   TanStack's data tag as an intersection, and TypeScript spreads an intersection as an array,
   not as a tuple. No type of the key both keeps the tag, which `getQueryData` reads, and spreads
   as a tuple. The package now exports `infiniteQueryKey(queryKey, pageParamName?)`, which the
   hook uses too, typed by the elements of the given key; the docs use it.

| Option | Pros | Cons |
| --- | --- | --- |
| Both forms of a whole toJSON body, `bodyFields` (chosen) | Right for any `Content-Type` source | A JSON body whose hidden members differ costs one more request |
| Pick the form by the init's `Content-Type` | One form per key | Wrong for a `Content-Type` set on the fetch client |
| Export `infiniteQueryKey` (chosen) | A typed key, the hook's own code | One more export |
| Type `InfiniteQueryKey` as any array | The spread compiles | The key's elements are no longer checked |

**Size.** The bundle grows from 3.89 kB to 4.08 kB minified (1.78 kB gzipped), past its 3.9 kB
budget, so the budget rises to 4.1 kB. Correctness ranks above size, as for the fetch client
(ADR-013, ADR-030). The parts: the boxed-primitive check (about 75 bytes), separate keys for a
whole body and a member (about 50), `bodyFields` (about 55) and the `infiniteQueryKey` export
(about 30). A helper for type tags was folded back into `isClass` (30 bytes less); what is left
could only shrink by cutting unrelated behavior, such as the signal merging, or one of these
fixes.

## Review trigger

A report of two queries that share an entry while their requests differ in something a key can
hold.
