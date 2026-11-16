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

## Amendment (2026-11-13): plain values for filters, texts of `NaN`, two types

The rule of the second amendment of 2026-11-12 holds; this amendment adds that a key must hold
plain values only, since TanStack Query's filters read the key, not only its hash.

1. **Objects in a key that filters cannot tell apart.** `invalidateQueries`, `setQueriesData` and
   `removeQueries` match a key as a prefix with `partialMatchKey`, which compares two objects by
   the own members of the filter's one. A Date, a boxed primitive or another object with a
   `toJSON` was kept in the key as it is: in a body (for its JSON form), and as a parameter value.
   It has no own members, so a filter with the key of one date matched the queries of every other
   date, and `setQueriesData` wrote one query's data into the others. The key now holds the plain
   form of such a value:
   - in a body, its JSON form: what `toJSON` returns, or the primitive of a boxed primitive. The
     hash is the same as before, so keys do not change. An object form is walked by its members,
     as JSON writes it. A whole body with own members keeps them in `bodyFields`, as before.
   - in `params` records and in plain `headers`, the form the fetch client sends: a value with a
     `toISOString` (how the client tells a date) as its ISO text, through
     `Date.prototype.toJSON`, which gives `null` for an invalid date instead of throwing while the
     component renders; any other object or array by its members, each as sent. A boxed primitive
     there is its members, as the client sends it (`new Number(1)` sends nothing). (Corrected by
     the second amendment of 2026-11-13: a serializer of the client may send an object's
     `toJSON` form or text, plain `headers` send the text of every value, and an invalid date
     and a bigint get keys of their own.)
2. **`NaN` and the infinities.** The hash writes them as `null`, so in a parameter or a form
   field they shared the key of `null` and of each other, while the fetch client sends the text
   `NaN` or `Infinity` and nothing for `null`. A `NaN` kept in a key also never matched itself in
   a filter (`NaN !== NaN`). In `params` and `headers` they are now their text, which is what is
   sent, so `NaN` and `"NaN"` share a key, as they share a request. In a body the key cannot tell
   JSON from a form body (the `Content-Type` may come from the fetch client), so the body keeps
   JSON's `null` and `bodyType` names the text (`{ n: "NaN" }`). A JSON body with `NaN` and one
   with `null` then send the same request under two keys: one request more, never another
   request's data.
3. **`infiniteQueryKey` of a general key.** For a TanStack `QueryKey` (`readonly unknown[]`) or a
   tuple of another length than 2 or 3, the result type was `never`. Such a key now stays as it
   is, so the result is a readonly array ending in the marker; the keys of `queryOptions` keep
   their precise types.
4. **`undefined` options.** Under `exactOptionalPropertyTypes`, `keyScope` of `createClient` and
   `pageParamName` of `useInfiniteQuery` rejected `undefined`, which a wrapper passes when its own
   option is left out, while the runtime already reads `undefined` as left out. Both now say
   `| undefined`, as the options of the fetch client do (ADR-041). The other options are
   TanStack Query's and keep its types.

| Option | Pros | Cons |
| --- | --- | --- |
| Plain forms in the key (chosen) | Filters and hashes agree; key hash of JSON bodies unchanged | About 470 bytes |
| Keep objects, document filters by hand-written prefixes | No code | `setQueriesData` writes wrong data with no error |
| `NaN` as its text in a body too | One shape | JSON `NaN` and `"NaN"`, which send different bodies, share a key |
| Pick the form by the init's `Content-Type` | Exact for JSON bodies | Wrong for a `Content-Type` set on the fetch client |

**Size.** The bundle grows from 4.08 kB to 4.55 kB minified (1.94 kB gzipped), so the budget
rises to 4.6 kB: the plain forms of parameter and header values (about 280 bytes) and of body
values with the `NaN` kinds (about 190). Correctness ranks above size (ADR-013, ADR-030).

## Amendment (2026-11-13, second): every form an object may be sent as, header texts

The rule, restated: two requests that may be sent differently never share a key. Splitting the
cache more costs a request; merging shows one request's data for another with no error. The
first amendment of 2026-11-13 broke it in four places.

1. **Objects in `params` by their members only.** Keyed by its own enumerable members, every
   object that keeps its state elsewhere had the key `{}`: a `URL`, a Temporal value, a value
   object with private fields and a `toString` or `toJSON`, a `Number` object. A
   `querySerializer` or `pathSerializer` set on the fetch client, which the key cannot see, may
   send such a value's text or its `toJSON` form, so different requests shared one entry, and a
   filter with the key of one matched the others. Up to rc.9 the hash wrote such a value as its
   JSON form. An object in `params` (other than a valid date or an array) is now keyed by every
   form a serializer may send: its own members, which the default serializers send, plus its
   `toJSON` form under `"toJSON()"` when it has a `toJSON`, and its text under `"toString()"`
   when `String` gives other text than the default `[object …]` tag. A plain object keeps its
   key. The forms go beside the members rather than in place of them, so an object whose members
   and `toJSON` differ is told apart by both, and a value with no members never shares the key
   of a string with its text, which the default serializer sends while it sends nothing for the
   object. The `"toJSON()"` form is walked as JSON writes it: an object form by its members,
   without calling a `toJSON` again, so a `toJSON` that returns its own object ends. An object
   without a `toString` (`Object.create(null)`) has no text: `String` would throw while the
   component renders.
2. **Plain `headers` by the parameter rule.** The fetch client sends a plain header value through
   `Headers.set` or, for an array, `append`, which send `String(value)`. The key held `new
   Number(5)` and `new Number(6)` as `{}` and a `Date` as its ISO text, which is not sent. A
   value of plain `headers` is now the text that is sent: `"5"` for `5` and `new Number(5)`, the
   local text of a `Date`, the href of a `URL`, the text of each item of an array. `null`, which
   removes a header, stays. `params.header` keeps the parameter rule: the client writes it in the
   `simple` style (a date as ISO text, an object by its members) and has no serializer option,
   so there the extra forms only split entries that send the same.
3. **A bigint.** TanStack Query's hash throws for a bigint, so a bigint parameter or form field
   crashed the component while the fetch client sends its text. In `params` and headers it is now
   its text, as `NaN` is. In a body it is its text with the kind `"bigint"` in `bodyType`: a form
   or multipart body sends the text, while JSON fails for it, so it must not share the key of a
   JSON string.
4. **An invalid date.** `Date.prototype.toJSON` gives `null` for an invalid date, so it had the
   key of a `null` parameter, which sends nothing, while the request with the date fails with a
   `RangeError`. The ISO text is now taken only when there is one; an invalid date falls to the
   object rule and is `{ "toJSON()": null, "toString()": "Invalid Date" }`.

The member names `"toJSON()"` and `"toString()"` are in band: a plain object parameter with such
members would share a key with an object of those forms. No request names a member like this,
and the names say what they hold when a key is read in the devtools.

| Option | Pros | Cons |
| --- | --- | --- |
| Members plus the `toJSON` form and text beside them (chosen) | Distinct for the default and custom serializers; plain objects keep their keys | Two more members in such keys |
| The JSON form only, as rc.9 | Smaller | A URL shares the key of its href string, which the default serializer sends differently; objects whose members differ under one `toJSON` merge |
| Members only (rc.10) | Exact for the default serializer | Every member-less object shares `{}` under a custom serializer |
| Plain headers by the parameter rule | One rule | Headers send the text, so a `Date` and a `Number` object keyed wrongly |

**Size.** The bundle grows from 4.55 kB to 5.19 kB minified (about 2.1 kB gzipped), so the
budget rises to 5.2 kB: the object forms with the text check (about 330 bytes), header texts
(about 150), the invalid-date fall-through and bigint texts in params and bodies (about 120).
Correctness ranks above size (ADR-013, ADR-030).

## Amendment (2026-11-14): records of any class, functions, header names, unreadable values

The rule, restated with what this amendment adds: two requests that openapi-typesafe-fetch may
send differently never share a key; a key never throws while the component renders; and a
filter with the key of a query finds it, also after `dehydrate` and `hydrate` (a JSON round
trip). Five gaps broke it.

1. **Records that are not object literals.** `params` and its `query`, `path` and `header`
   records were walked only when they were object literals; any other object, such as a class
   instance DTO, stayed in the key as it was. Its `NaN` hashed as `null` and shared the key of a
   `null` parameter, a bigint made the hash throw, and a `Date` member kept the object, which
   filters match by its (missing) own members, so `setQueriesData` wrote into the queries of
   other dates. The fetch client reads any record by its members, so every object record is now
   keyed as an object literal is: a query or path record by `objectKey` (a serializer of the
   client gets it whole), a header record by its members.
2. **Functions in the init.** A `fetch`, a serializer or the hooks of a `middleware` stayed in
   the key. The hash drops them, but `partialMatchKey` compares them by identity, so with an
   inline function a filter with the key of a later render (`invalidateQueries`,
   `setQueriesData`, the docs' own `useInvalidateQuery`) missed the query, and after `hydrate`,
   which has no functions, every filter did. The init's members other than `params`, `headers`,
   `body` and `signal` are now plain values by the parameter rule, which leaves a function out
   wherever it is. Decision 3 still holds: queries that differ only in a function share an entry.
3. **Header names in two letter cases.** `Headers` matches a name in any case, and the client
   sets plain headers one after the other, so `{ "X-A": "1", "x-a": "2" }` sends `x-a: 2` and the
   reverse order `x-a: 1`, while both had one key. Plain header names are now folded to lower
   case in order, as the client's `mergeHeaders` does: a value sets the header, `null` removes
   it, an array appends its items, and `undefined` does nothing. Items appended after the same
   name was set or removed in the object give the whole text joined with `, `; items appended to
   nothing yet keep their list, since they add to the client's own headers. `params.header` is
   folded the same way with the last value kept, since the client sets each one. Header names in
   keys are therefore always lower case, as they already were for a `Headers` object and pairs.
4. **Values a key cannot read.** rc.11 calls `toJSON`, `toString` and `toISOString` of parameter
   and header values; one that throws, or a `toJSON` that loops, crashed the component while it
   rendered, as did a getter that throws and an object that refers back to itself. Each such
   read is now guarded: a form that throws is left out of the key, a member whose getter throws
   is left out, and a reference back to an object the walk is inside of is left out, which ends
   every loop. The request reads the value again and reports its own error as a query error.
   Such a value shares a key with one that has the same readable forms. Both send the same
   unless a serializer reads the form that throws; then the first request fails, so the shared
   entry can only hold a failure or the other's data for a value that cannot be sent at all. No
   two requests that both succeed are merged.
5. **`undefined` array items.** The hash writes an `undefined` item (also a hole) as `null`, so
   with a `qs` serializer `[1, undefined]` and `[1, null]`, which send `ids[0]=1` and
   `ids[0]=1&ids[1]=`, shared a key, and after a JSON round trip the key held `null`, which a
   filter with the key of `undefined` does not match. In parameters such an item, and a function
   item, is now `{ "(undefined)": true }`, an in-band form like `"toJSON()"` that JSON keeps. In
   a body it is `null`: JSON, form and multipart bodies send `null` and `undefined` items alike,
   so the key only stops changing in the round trip.

Members of a parameter object are its own enumerable ones, as before. The client's default
serializers read inherited enumerable members too (`for…in`), but a key of those would hold
every attribute of a `URL` or another platform object, whose attributes are enumerable on its
prototype; an object made by `Object.create(defaults)` as a parameter value is left to the
review trigger.

| Option | Pros | Cons |
| --- | --- | --- |
| One parameter rule for every object record and init member (chosen) | Complete: no class of record or member is kept raw | Header names in keys change to lower case |
| Walk class instances only where a report found them | Smaller | The next record kind repeats the bug |
| Strip only top-level init functions | Smaller | Middleware objects and nested functions still miss filters |
| Keep header names as written unless two collide | Keys of most apps unchanged | A special case; one key per spelling of the same request |
| Catch around the whole key | One `try` | No key to fall back to: every fallback merges requests |

**Size.** The bundle grows from 5.18 kB to 5.84 kB minified (about 2.4 kB gzipped), so the
budget rises to 5.9 kB: guarded reads with the cycle check, the header fold in order, the
`undefined` item form in parameters and bodies, and the walk of every record and init member.
Correctness ranks above size (ADR-013, ADR-030).

## Amendment (2026-11-15): one rule for reading values, Map and Set

The rule of the amendment of 2026-11-14 held for parameters only: the body walk had its own code
without its guards, and a few reads of `params` and `headers` had none either. Three gaps broke it.

1. **Functions in a body.** A function member of a body, or a function array item, stayed in the
   key. The hash drops it, but `partialMatchKey` compares functions by identity, so a filter
   with the key of a later render, and every filter after `hydrate`, missed the query. A
   function body stayed too.
2. **Values a key cannot read.** A circular body (`RangeError`), a body member whose `toJSON`
   or getter throws, a revoked `Proxy` anywhere, a `toJSON` or `toISOString` getter that throws,
   and header pairs with an item that is no list made the key throw while the component rendered.
3. **Map and Set.** A `Map` or `Set` keeps its contents in none of its members, has no `toJSON`
   and the text `[object Set]`, so every one had the key `{}`, in a body and in `params`. JSON and
   the default serializers send `{}` or nothing for it, but a `querySerializer` or
   `bodySerializer` that sends the contents sent different requests under one key.

The fix is one rule, in `key-read.ts`, that the body, the parameter and the header keys all read
values through; each still writes what it reads by its own rule (JSON forms and kinds for a body,
every serializer form for parameters, texts for headers):

- **Members.** `readMembers` gives an array's items by index, also holes; any other object's own
  enumerable members, a member whose getter throws as `undefined`; and for a `Map` or a `Set`
  one more member with its contents in order, under `"entries()"` (`[[key, value], …]`) or
  `"values()"`, in-band names like `"toJSON()"`. Contents are plain values, so they survive a
  JSON round trip and filters read them.
- **Left out.** `keyOf` leaves out a function (JSON leaves it out of a body and writes a function
  item as `null`, which the body key now does too), a reference back to an object the walk is in,
  and a value whose reading throws in any way (the request reads it again and reports the
  error). The finer guards of 2026-11-14 stay, so a `toJSON` that throws still leaves the members
  and the text of a parameter value, and now a `toJSON` that throws on a whole body leaves its
  `bodyFields`, which a form or multipart body sends.
- **Every entry point.** The init's members, `params`, each record, `headers` and the body are
  each read with `keyOf`, so a function `params`, record or `headers` is left out too.

Other iterables are not iterated. An iterator or a generator is used up by reading it, which
would take the values its request sends, and a class of the caller may iterate without end, which
would hang the render; such a value is keyed by its own members, and a `toJSON` gives it a key of
its contents. A `WeakMap`, `WeakSet` or `WeakRef` cannot be read, by the key or by a serializer,
so `{}` is right for it. `ArrayBuffer` and `DataView` inside a body keep the rule of the second
amendment of 2026-11-12 (as JSON sends them); a whole bytes body is keyed by its bytes.

Keys that change against rc.12: a `Map` or `Set` value, in `params` or a body, is its contents
instead of `{}`; a function in a body, and a function `params`, record or `headers`, is no
longer in the key (the hash is the same, so the cache entry is the same, but filters now find
the query); keys that threw now exist. (Corrected by the second amendment of 2026-11-15: the
`bodyFields` of a whole body with its own `toJSON` changed too.)

| Option | Pros | Cons |
| --- | --- | --- |
| One read rule shared by body, params and headers (chosen) | The next guard holds everywhere; smaller than two copies | The body key's left-out members read as `undefined` entries, which the hash drops |
| Copy the parameter guards into the body walk | Smaller diff | Two walks to keep in step, which is how this gap came |
| Iterate every iterable | Covers custom collections | Uses up iterators, may never end |
| Map and Set as arrays | Shorter keys | Share the key of an array, which JSON sends differently |
| Map and Set kinds in `bodyType` | Out of band in bodies | Parameters have no `bodyType`; two shapes for one value |

**Size.** The bundle grows from 5.84 kB to 6.10 kB minified (about 2.5 kB gzipped), so the
budget rises to 6.1 kB: the shared reader with the Map and Set contents (about 150 bytes) and the
guarded reads of the init, `params`, records, `headers` and bodies (about 100). Correctness ranks
above size (ADR-013, ADR-030).

## Amendment (2026-11-15, second): deep values, Map and Set lookalikes, `NaN` texts

Three gaps broke the rule of 2026-11-14, and one key change of rc.13 was not listed.

1. **Values deeper than the stack.** The walk of a key is recursive, and `attempt` caught the
   `RangeError` of a stack overflow at whatever level it came, as if that value could not be
   read. A body some thousand objects deep, which JSON sends, had a key cut at a depth that
   changed from call to call while the JIT warmed up (a new key, and a new request, on such a
   render), and two bodies that differed below the cut shared one key. A stack overflow says
   nothing about the value, so the key no longer depends on the stack: one walk reads 100
   objects deep (`WALK_DEPTH`); an object deeper is written as `{ "(deeper)": n }` and read in
   a walk of its own once the walk above it is done, on as short a stack. The init lists these
   segments in order under `"(deeper)"`, each as its own walk writes it. An object met again
   below `WALK_DEPTH` keeps its segment, which ends a reference back that closes that deep (a
   shorter one ends on the path, as before) and writes an object two members share once. After
   100 levels of segments, ten thousand objects deep, a segment is its JSON text, which
   `JSON.stringify` writes without the stack for plain data, as a JSON body sends it; this ends
   a getter that makes a new object each time it is read. Each part of a key stays within the
   depth TanStack Query's hash writes (about 5,000 levels on Node's default stack).
2. **Map and Set lookalikes.** A MobX observable `Set` or `Map` has the type tag of a `Set` or
   `Map`, is no instance of either, and keeps its contents in own members, one of which notes
   each reader (`atom_.lastAccessedBy_`). The key read those members beside the contents, so in
   an `observer` component every render had a new key and sent a new request, without end. A
   value that is a `Map` or `Set` by its type tag only is now its contents alone. A `Map` or
   `Set` of this realm keeps its contents where no member is, so its own members are data of
   the caller, which JSON and the default serializers send; they stay in its key beside the
   contents. MobX observable arrays (`Array.isArray` holds) and objects (data in own members,
   state under a symbol) were stable and stay so. Any other class instance is its own enumerable
   members, which JSON and the default serializers send; a class that keeps changing state in
   them gets a new key when it changes. An Immutable.js collection, so keyed by its trie, its
   `toJSON` form and its text, changes key once, when it is first hashed (`__hash`); pass plain
   values (`toJS()`) for a key of the contents alone.
3. **`NaN` and its text.** In `params`, `NaN`, the infinities and a bigint were their text, so
   `NaN` and `"NaN"` shared a key. The text is what `qs` and the fetch client's own serializers
   send, but a JSON `querySerializer` sends `null` for `NaN` and the string for `"NaN"`, and a
   serializer of the client may tell a bigint from a string too. Such a value is now
   `{ "(number)": "NaN" }`, which is no string and no `null`, and stays the same through a JSON
   round trip. In a body, `bodyType` already tells them apart. Plain `headers` keep the text,
   which `Headers` sends for either. A `params.header` value is keyed by the parameter rule, so
   there `NaN` and `"NaN"`, which send one header, now have two keys: one request more, never
   another request's data.
4. **An rc.13 key change not listed.** rc.13 reads a whole body with its own `toJSON` through the
   shared reader, so its `bodyFields` hold its own members, which a form or multipart body sends,
   with a function member left out: `{ x: 1, toJSON: () => "j" }` has the `bodyFields` `{ x: 1 }`
   (rc.12: `"j"`) and `{ toJSON: () => ({ a: 1 }) }` has `{}` (rc.12: `{ a: 1 }`). rc.12 wrote
   the `toJSON` form there, which no form body sends.

Keys that change against rc.13: a body or a parameter value more than 100 objects deep has the
part below that depth under `"(deeper)"`; a MobX-style `Map` or `Set` is its contents alone;
`NaN`, an infinity or a bigint in `params` is `{ "(number)": text }`. No other key changes; the
hunt's corpus of 49 inits has the same keys but for the `NaN` and bigint parameters.

| Option | Pros | Cons |
| --- | --- | --- |
| Segments read in their own walks, JSON text below them (chosen) | Every form of a value up to ten thousand objects deep; stable; no stack bound | About 450 bytes; deep keys have a second part |
| Iterative walk with an explicit stack | One key shape | Every writer rewritten as a state machine; the key's depth then overflows TanStack Query's hash |
| JSON text below a fixed depth | Small | Loses the `Map`, `NaN` and text forms below it, which a serializer may send |
| Stop catching `RangeError` | Honest | A deep body crashes the component while it renders |
| Contents alone for every Map and Set | One rule | A `Map` subclass with fields shares the key of one with other fields, which JSON sends apart |
| `NaN` as `null` in params | No in-band name | Shares the key of `null`, which `qs` sends differently |

**Size.** The bundle grows from 6.10 kB to 6.77 kB minified (about 2.8 kB gzipped), so the
budget rises to 6.9 kB: the segments (about 450 bytes), the `Ancestors` passed through the header
and record keys (about 150), the lookalike rule and the number form (about 70). Correctness
ranks above size (ADR-013, ADR-030).

The check that a header pair is a list of exactly a name and a value, as `Headers` requires,
adds about 30 bytes: 6.93 kB, budget 6.95 kB.

## Review trigger

A report of two queries that share an entry while their requests differ in something a key can
hold.
