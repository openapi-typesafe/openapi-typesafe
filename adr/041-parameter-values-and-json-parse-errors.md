# ADR-041: Parameter values and JSON parse errors (audit finding F7)

- Status: Accepted
- Date: 2026-11-08

## Context

The 1.0 audit (finding F7) ran the same requests through `openapi-typesafe-fetch` 1.0.0-rc.3 and
openapi-fetch 0.17 on Node.js 24, Bun 1.4.4 and Deno 2.9.6. Both clients behave the same here:

| Case | What was sent or returned |
| --- | --- |
| `query: { d: new Date(0) }` | `/echo`: a `Date` is an object, a `deepObject` without members, so nothing was sent |
| `query: { at: [new Date(0)] }`, or a `Date` in a `form` object | `String(date)`: `Thu Jan 01 1970 01:00:00 GMT+0100 (…)`, local time that servers do not parse |
| a `Date` path parameter | an empty segment, for the same reason as the query |
| `query: { a: "", e: {}, f: 0 }` | `?a=&&f=0`: the empty object gave an empty part, and `join("&")` kept its separator |
| `query: { a: [null, 1] }`, `{ o: { x: null, y: 1 } }` | stray separators: `null` items gave empty parts too |
| `200` with `Content-Type: text/plain`, no `parseAs` | `SyntaxError: Unexpected token 'h', "hello" is not valid JSON` |
| `200` with an HTML body (a proxy page) where JSON was expected | a bare `SyntaxError` that names neither the status nor the content type |
| `TRACE()` | Node.js: `TypeError: 'TRACE' HTTP method is unsupported.`; Deno: `TypeError: Method is forbidden`; Bun: the request is sent, the response body is empty |

The generated response types follow the media types: an operation with `text/plain: string` types
`data` as `string`, while the client parses every success body as JSON unless `parseAs` is set.

Drop-in compatibility with openapi-fetch is the product's core promise. Test doubles built with
`new Response(JSON.stringify(data))` are very common, and their `Content-Type` is
`text/plain;charset=UTF-8`; some real servers also send JSON as `text/plain`.

The client has no error classes of its own: it throws `Error` for invalid options and lets the
platform's errors (`TypeError`, `SyntaxError`) through.

The bundle was 8.66 kB against a budget of 8.75 kB.

## Decision

1. **Dates.** A `Date` parameter value is sent as `toISOString()` (ISO 8601, UTC): as a query
   value, as an item of an array in every array style, as a member of an object in every object
   style, and as a path parameter in every path style. A value counts as a `Date` when it has a
   `toISOString` method, so a `Date` from another realm counts too (the rule of ADR-030 for Fetch
   API objects). An invalid `Date` throws the platform's `RangeError`.
2. **Empty values.** A query parameter that serializes to nothing (`null`, `undefined`, an empty
   array, an empty object) is left out with its `&`. `serializeArrayParam` and
   `serializeObjectParam` return `""` for an empty array or object in every style, and an exploded
   array (`form`, `spaceDelimited`, `pipeDelimited`, `matrix`) or object leaves out its `null` and
   `undefined` items and members, as the top level always did. Unexploded styles and the `simple`
   and `label` array styles keep writing such items as text, as before.
3. **Response bodies keep openapi-fetch's default.** Without `parseAs`, every success body is
   parsed as JSON, whatever its `Content-Type`; a `text/*` body needs `parseAs: "text"`. Error
   bodies are parsed as JSON and stay text when they are not JSON, as before.
4. **Bodies that are not JSON.** When a success body must be JSON and is not, the client throws a
   `SyntaxError` with the message
   ``Response <status> (<Content-Type or "no Content-Type">) is not JSON; <hint>: "<first 100
   characters>"`` and the parser's error as `cause`. The hint is ``set `parseAs: "text"` `` for a
   `text/*` response and ``set `parseAs` `` otherwise. It stays a `SyntaxError`, so code that
   catches one still does.
5. **TRACE.** `TRACE()` stays (ADR-013, decision 5). The docs list what each platform does: it
   rejects in browsers (the Fetch standard forbids the method), Node.js and Deno, and in Bun 1.4 it
   is sent but the response body is always empty.
6. **Size.** The bundle budget rises from 8.75 kB to 9.25 kB (8.99 kB after these changes).

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| `Date` as `toISOString()` (chosen) | The OpenAPI `date-time` format is RFC 3339; servers parse it; same text in every time zone | A server that wants `format: date` (`2026-11-08`) needs a `querySerializer` or a string |
| `Date` as `String(date)` (before) | No change | Local time, time zone name in the user's language; not a date-time any server reads |
| `Date` as epoch milliseconds | Short | Not what `format: date-time` describes |
| Leave out empty parts (chosen) | `a=1&b=2`; no empty parameter names on the wire | A server that read `&&` as an empty parameter (none can) sees a change |
| Send `name=` for an empty array | Says "empty" on the wire | No OpenAPI style defines it; openapi-fetch also leaves the top-level empty array out |
| JSON unless `parseAs`, with a hint in the error (chosen) | Same results as openapi-fetch; the error says how to read a text body | A `text/plain: string` operation still needs `parseAs: "text"`, as upstream |
| Read `text/*` bodies as text when `parseAs` is not set | Runtime matches the generated `string` type of `text/*` media | Rejected: every `new Response(JSON.stringify(x))` double and every server that sends JSON as `text/plain` would silently get a string instead of an object, breaking the drop-in promise |
| `SyntaxError` with status, type, hint and excerpt (chosen) | Existing `catch (e instanceof SyntaxError)` keeps working; the message says what came back and what to do | The message carries 100 characters of the body, which may reach logs |
| A new exported error class with `response` | Typed access to the response | New public API and bytes for one case; the client has no error classes to fit into |
| Remove `TRACE()` | No platform surprise | Breaking change; `trace` operations exist in OpenAPI |

## Consequences

- Each code change is a user-visible fix with its own changeset.
- The migration guide lists the changes under client fixes, and the API page documents the rules
  and the `TRACE` table.
- The serializers touched here were split into helpers of at most 30 lines, so
  `serializeObjectParam` and `serializeArrayParam` lose their ADR-036 suppressions.
- The excerpt in the parse error is at most 100 characters of a body the server sent; it holds no
  request data.
- Only the bodies that threw before are affected: a body that parsed as JSON gives the same data.

## Amendment (2026-11-08): findings of the rc.3 bug hunt

The bug hunt on rc.3 (`RC4_BUGS.md`, items S2 and F2) found two gaps in this decision.

### The parse error holds no body text (S2)

Decision 4 put the first 100 characters of the body into `error.message`. An OAuth token endpoint
that answers in form encoding unless it is asked for JSON (GitHub does this) sends
`access_token=gho_…`, so the token went into `String(error)`, `console.error` output, log lines and
the `value` of an error tracker event. The Context said that the excerpt "holds no request data";
it holds response data, which is just as secret.

1. The message is ``Response <status> (<Content-Type or "no Content-Type">) is not JSON (<length>
   characters); <hint>``: the length of the body text, never the text. The hint and the
   `SyntaxError` class stay.
2. The parser's error stays the `cause`. Its message is the platform's: V8 quotes up to 10
   characters of the input (`Unexpected token 'a', "access_tok"... is not valid JSON`), and
   openapi-fetch 0.17 threw that error as it is, so nothing new reaches a log through it.
3. To see the body, read the response with `parseAs: "text"`; the docs say so.

| Option | Pros | Cons |
| --- | --- | --- |
| Status, type, length and hint (chosen) | Tells an HTML page (a long body of a `text/html` type) from a short message; no secret can leak | The text itself takes one more request with `parseAs: "text"` |
| Keep a shorter excerpt (20 characters) | Shows the start of a page | A token or a session id fits in 20 characters |
| Keep the excerpt, mask values that look secret | Readable | Guessing what a secret looks like misses some; extra code |
| A `body` property on the error | Text available to code | Error trackers serialize own properties too |

### Dates in form bodies (F2)

Decision 1 covered parameters only. In an `application/x-www-form-urlencoded` or
`multipart/form-data` body a `Date` is an object, so it hit the nested value check of ADR-013
(decisions 7 and 10) and threw `Nested form values need your own bodySerializer()`.
openapi-fetch 0.17 sent `String(date)` in a form, a local-time text.

4. A `Date` field, or a `Date` item of an array field, is sent as `toISOString()` in both form
   bodies, by the same rule as parameters: a value with a `toISOString` method counts.

### Size

5. The fixes of the rc.3 bug hunt (S2, S3 and F1 to F6, in this ADR and in the amendments of
   ADR-013, ADR-025 and ADR-030 of the same date) take the bundle from 8.99 kB to 9.37 kB
   minified (3.57 kB to 3.70 kB gzipped), over the 9.25 kB budget. The largest parts are the
   `baseUrl`-aware path check (F1), the stream body with its `duplex` (F5), the FormData header
   rule (F3) and the fuller `Response` check (F6). The code was already cut down: object keys
   reuse the value encoder, and the form bodies share one `Date` rule with parameters. The rest is
   the behavior, so the budget rises to 9.5 kB. Correctness ranks above size (CODING_PRINCIPLES
   §1), and the descriptions state the new gzipped size.

## Amendment (2026-11-09): the parse error has no `cause`

Point 2 of the amendment above is wrong. It said the parser's error quotes "up to 10 characters"
and that nothing new reaches a log through it. A recheck found that V8 quotes a short input whole
(`Unexpected token 's', "sk_live_abc123" is not valid JSON`) and the first 10 characters of a
longer one, and JavaScriptCore (Bun, Safari) quotes the first token it fails on
(`Unexpected identifier "gho_16C7e4..."`), which for a bare token body is the token itself. Error
trackers and `console.error` print the `cause` chain, so the secret reached a log through it. That
openapi-fetch 0.17 threw the same error does not make it safe: the point of the message rule is
that the client's error holds no body text.

Point 2 now reads:

2. The client's `SyntaxError` has no `cause`. The parser's error adds only body text and a position
   that differs by engine; the status, the `Content-Type`, the length and the hint say what came
   back, and `parseAs: "text"` shows the body when the caller chooses to read it.

| Option | Pros | Cons |
| --- | --- | --- |
| No `cause` (chosen) | No body text anywhere in the error; fewer bytes | The engine's position is gone; the body takes a `parseAs: "text"` request |
| A sanitized cause (name and position only) | Keeps a position | The position must be parsed out of engine-specific messages; a made-up error is no better than none |
| Keep the parser's error | Platform detail kept | Leaks short secrets whole on V8 and the first token on JavaScriptCore |

## Review trigger

A report of a server that needs empty parameters on the wire or a `Date` in another format, a
2.0 decision to follow the response `Content-Type`, or a Bun release that returns the body of a
`TRACE` response.

## Amendment (2026-11-09): what openapi-fetch 0.17 sent for a `Date`

A recheck with openapi-fetch 0.17.0 and the default query serializer corrected the Context table:
`query: { list: [date] }` and `query: { o: { at: date } }` throw "Deeply-nested arrays/objects
aren't supported", because the default styles explode arrays and objects. `String(date)` was sent
only with `explode: false` (`form`, `spaceDelimited`, `pipeDelimited`) and in an
`application/x-www-form-urlencoded` body. A `Date` on its own in the query or the path was left
out, as the table says. The decisions do not change; the changelog lists the wire changes
(urlencoded and `explode: false` values, and values that were left out) as changes that can need
work.

## Amendment (2026-11-09): the path check names the template, not the URL

The path check of ADR-013 and ADR-030 threw `Dot path segment in <url>` and
`Empty first path segment in <url>`. The URL holds the `baseUrl`, which may carry credentials
(`https://user:secret@host`), and the values, which may carry a token (`/files/{token}`); errors
reach logs and error trackers, as the parse error does (amendment "the parse error has no
`cause`"). The messages now name the part of the template from the segment of the first parameter
on, before `?` or `#` (`Dot path segment in "{name}/raw"`): it says which
parameters to look at and holds no value and no part of the `baseUrl`. Masking secrets in the URL
was rejected for the reason the parse error does not mask its excerpt: a guess at what a secret
looks like misses some.

## Amendment (2026-11-09): the path check names one template segment

The amendment above named the template from the segment of the first `{…}` on. The client
serializes the `baseUrl` and the path as one template, so a `{` in the `baseUrl` (a server
variable left in it, `https://user:secret@{region}.api.example/v1`) moved that start into the
`baseUrl`, and the message showed its credentials. The message now names only the template segment
that made the bad segment (`Dot path segment in "{id}"`, `Empty first path segment in "{org}"`).
Values are percent-encoded and add no `/`, so segment `i` of the URL comes from segment `i` of the
template, and a segment that serializes to `.`, `..` or nothing holds only parameters and dots.

The size budget rises from 9.6 kB to 9.7 kB: the segment check takes the minified bundle from
9,597 to 9,640 bytes, 40 bytes over the old budget. Correctness ranks above size
(CODING_PRINCIPLES §1), as in the amendments of ADR-013.

## Amendment (2026-11-09): header parameter values

The runtime hunt before rc.5 found that `params.header` values went to `Headers` as they were: a
`Date` as local time (`Thu Jan 01 1970 01:00:00 GMT+0100`), an object as `[object Object]`, an
array as `a, b` from `Headers.append`. The value rules of this ADR now cover headers too, in the
`simple` style, the only style OpenAPI defines for headers:

1. A `Date` is `toISOString()`, as in the query and the path.
2. An array is `a,b` and an object is `name,value` pairs (`role,admin`): the value is written by
   `serializeArrayParam` and `serializeObjectParam` in the non-exploded `simple` style, the
   default for headers, so a header follows the rules of a `simple` path parameter (decision 2).
   An empty array or object sends no header.
3. `null` still removes a header set at a lower level, and other values are sent as their text.
4. Values are not percent-encoded (`allowReserved`): a header holds no URL, and `Headers` rejects
   what it cannot send. The `headers` option keeps its own rules (an array is appended item by
   item).

| Option | Pros | Cons |
| --- | --- | --- |
| `simple` style, not exploded (chosen) | OpenAPI's default for headers; same `Date` text as the query | An exploded object header (`role=admin`) needs a string |
| Read `explode` from the schema | Exact | The client has no schema at runtime |
| Keep `Headers.append` for arrays | No change for arrays | `a, b` is not the `simple` style; objects still `[object Object]` |

## Amendment (2026-11-09): size after the rc.5 client fixes

The fixes of the runtime hunt before rc.5 take the bundle from 9,640 to 10,524 bytes (size-limit,
minified): telling bodies by their type tag and copying a FormData into the `FormData` option
(ADR-030), status keys by first digit (types only, ADR-025), the empty body by `parseAs`, header
parameters in the `simple` style (above), the query before a fragment, and an `Error` of another
realm in `onError`. The budget rises from 9.7 kB to 10.6 kB. Correctness ranks above size
(CODING_PRINCIPLES §1), as in the amendments of ADR-013. The size the docs state comes from the
same measure: about 10.5 kB minified and 4 kB gzipped; `openapi-typesafe-react-query` is about
2.2 kB minified and 1 kB gzipped, so its "1 kB" is now "2 kB minified, 1 kB gzipped".

## Amendment (2026-11-10): nested values, object names and partial query options

The recheck of the rc.5 fixes found three more cases.

1. A nested object or array as an array item or an object value, in a header or in a query or
   path parameter that is not exploded, was sent as `[object Object]`. Every value now goes
   through one function that fails for it, with the message of a nested query value.
2. The names of a non-exploded object were percent-encoded also with `allowReserved`, so a header
   object `{ "a b": "c" }` went out as `a%20b,c`, while the docs say header values are not
   encoded. A name is part of the value, so `allowReserved` keeps it as it is too.
3. A request's `querySerializer.array` or `.object` replaced the client's whole, so
   `{ array: { explode: false } }` dropped the client's `pipeDelimited` style. Since each of
   `style` and `explode` may be left out, they merge by key: the request's, then the client's,
   then the default.

With the platform body classes of ADR-030 the bundle grows from 10,524 to 10,742 bytes
(size-limit, minified; about 4.2 kB gzipped). The budget rises from 10.6 kB to 10.8 kB, and the
docs state about 10.7 kB minified and 4 kB gzipped. Correctness ranks above size
(CODING_PRINCIPLES §1), as in the amendments above.

## Amendment (2026-11-11): the nested value error names the hook, and `undefined` options

The recheck of the rc.6 fixes found two more cases.

1. A nested object or array in a path parameter failed with the query message, which tells the
   user to write a `querySerializer()`; the path's hook is `pathSerializer()`. Each location now
   has its own message on the shared start `NESTED_VALUE_ERROR`: the query names
   `querySerializer()`, the path `pathSerializer()`, and a header names no hook, since headers
   have none. The path and headers check an array or object for nested members before they
   serialize it, so the check inside the shared serializers stays the query's.
2. A request's query option set to `undefined` (`{ array: { explode: opts.explode } }` from a
   wrapper) replaced the client's value, since a spread copies `undefined`. An option that is
   `undefined` now counts as left out, at the top level (`allowReserved`) and in `array` and
   `object`, as the docs say.

| Option | Pros | Cons |
| --- | --- | --- |
| Check the members before the path and header serializers (chosen) | One message per location; the public serializers keep their contract | A second walk over the members of an array or object |
| Pass the message into `encodeValue` and the serializers | One walk | A new parameter through public functions that users call |
| Catch and rethrow the query error in the path serializer | No new check | Matches on a message text to tell errors apart |

The two checks and messages take the bundle from about 10.95 kB to 11.22 kB (size-limit,
minified). The budget rises from 11 kB to 11.3 kB; the docs keep "about 11 kB minified". The
smaller choices are listed above and are worse. Correctness ranks above size
(CODING_PRINCIPLES §1), as in the amendments above.

## Amendment (2026-11-12): the serializers name the hook by style, and option types take `undefined`

1. The exported `serializeArrayParam` and `serializeObjectParam` still failed with the query
   message for a path style, also when a user's `pathSerializer()` calls them. They now check
   their members themselves, by the `style` they get: `simple`, `label` and `matrix` name
   `pathSerializer()`, the other styles `querySerializer()`. The path styles are the keys of one
   map, `PATH_STYLE_JOINERS`, which also joins their exploded parts. The default path serializer
   no longer checks first; headers still do, since a header has no hook to name. The public
   signatures are unchanged.
2. The types of `QuerySerializerOptions` say `| undefined` on every option, so the `undefined`
   rule above also compiles under `exactOptionalPropertyTypes`.

The bundle stays within the 11.3 kB budget (11.27 kB).

## Amendment (2026-11-12): every client and request option takes `undefined`

The amendment above typed the members of `QuerySerializerOptions` with `| undefined`, but not the
`querySerializer` option itself, nor the other options, so a wrapper that passed its own optional
`querySerializer` or `baseUrl` on still failed under `exactOptionalPropertyTypes` (TS2769,
TS2379). The rule is now general: every optional option of `ClientOptions`,
`CustomFetchClientOptions` and `RequestOptions` that the client counts as left out when it is
`undefined` says `| undefined` in its type: `baseUrl`, `fetch`, `Request`, `FormData`,
`querySerializer`, `bodySerializer`, `pathSerializer`, `headers`, `requestInitExt`, `parseAs`,
`middleware` and `params`. The runtime already took `undefined` for each one (defaults and
truthiness checks); a test sends a request with all of them `undefined`. The options from the DOM
lib's `RequestInit` keep its types, which are not ours to change, and an optional `body` already
included `undefined`. Types only; the bundle is unchanged.

## Amendment (2026-11-12): an error body is parsed by its `Content-Type`

`readErrorBody` ran `JSON.parse` on every error body, as openapi-fetch does, and kept the text
only when that failed. The types (ADR-025, amendment of 2026-11-12) and the docs say that an error
body of a media type that is not JSON is the text, a `string`. So a `text/plain` body `429`,
`true`, `0` or `null` came back as a number, a boolean or `null`, and with `0` or `null`
`if (error)` was skipped and a failure looked like an empty success. The client now reads the
`Content-Type` of an error response:

1. A JSON media type (`JSON_MEDIA_TYPE_RE`: `json` or a `+json` suffix, with parameters): the
   body is parsed; a body that does not parse stays the text, as before.
2. Any other media type: the text, unparsed.
3. No `Content-Type`: nothing names the media type, so the body is parsed when it is JSON, else
   it is the text. The types cannot see a missing header; they describe the media type that the
   document declares, which a server that follows it sends. The docs say so.

A success body is unchanged: `parseAs` decides, whatever the `Content-Type` (openapi-fetch parity).

| Option | Pros | Cons |
| --- | --- | --- |
| By `Content-Type`, try JSON without one (chosen) | Runtime, types and docs agree; a server that sends JSON without a header still works | Differs from openapi-fetch for non-JSON error bodies that parse |
| Type every non-JSON error body as `unknown` | No runtime change | Loses the `string` for HTML and text errors; `if (error)` still skipped for `0` and `null` |
| Text whenever the header is not JSON, also when it is missing | Simplest rule | A JSON error without a `Content-Type` becomes a string, which its type does not say |

The `"Content-Type"` name is now one constant, which keeps the bundle within the 11.3 kB budget
(11.296 kB).
