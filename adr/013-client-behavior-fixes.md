# ADR-013: Client behavior fixes for 1.0

- Status: Accepted
- Date: 2026-11-02

## Context

Task 7.6 reviews `openapi-typesafe-fetch` and `openapi-typesafe-react-query` for the client items of the
backlog (`research/backlog.md`, candidates 11, 12 and 15). Each one changes what a request or a result looks
like at runtime, so each needs a decision instead of a silent fix. The client bundle budget is 7.5 kB
(§4.7); it measured 7.39 kB before this task.

1. **String bodies (candidate 12; upstream #2555, #2761, #2382).** `defaultBodySerializer` calls
   `JSON.stringify` on every body that is not `FormData`. A `text/plain` body `"abc"` is sent as `"\"abc\""`.
   Upstream PR #2761 sends every string as is, which also changes JSON requests: a JSON string value `"abc"`
   would then be sent as `abc`, which is not valid JSON.
2. **Dot path segments (candidate 15; upstream #2483).** `encodeURIComponent` keeps `.`, so a path parameter
   `..` turns `/books/{category}` into `/books/..`, and URL resolution sends the request to `/`.
3. **Empty error bodies (candidate 11; upstream #2530, #2762, #2070, #2829).** A 4xx/5xx response without a
   body gives `{ error: undefined }`. Users who check `if (error)` take it for success. Upstream PR #2762
   puts the status text into `error`; that changes the runtime value and contradicts the declared type of
   `error` (the error body of the operation). In `openapi-typesafe-react-query` the same check makes such a
   query or mutation succeed with `undefined` data.
4. **Middleware request ids (task 7.4, fix 8; upstream #2486).** The id now comes from a counter. A per-client
   counter would give two clients that share one middleware the same ids.
5. **`TRACE`.** The client offers `TRACE`, but the Fetch standard forbids it in `new Request()`, so every
   `TRACE` call rejects with a `TypeError` from the platform.
6. **Raw bodies (pre-beta test plan §6, PB-19).** `defaultBodySerializer` JSON-encoded every body that is not
   `FormData`. A `Blob`, `File`, `ArrayBuffer` or typed array became `{}`, so a `format: binary` upload lost
   its data without an error, and a `URLSearchParams` body became `{}` too.
7. **Nested form values (PB-20).** For `application/x-www-form-urlencoded`, `new URLSearchParams(body)` wrote
   a nested object as `[object Object]`. Form encoding has no standard for nesting: servers read `a[b]`,
   `a.b` or a JSON string.
8. **Query on a path with `?` (PB-21).** A path such as `/search?v=2` with `params.query` got a second `?`.
9. **Parameter names and object keys (pre-beta test plan 10.4, PB-33).** Values were percent-encoded,
   names and object keys were not. The keys of an `additionalProperties` query object are data, so a key
   `a&admin` added a query parameter, and a path object key `a/b` added a path segment.
10. **Multipart bodies (roadmap R1; upstream #1214).** With `Content-Type: multipart/form-data`, an object
   body was JSON-encoded, so a file upload needed a hand-written `bodySerializer`. A `FormData` body with that
   header set by hand went out without the `boundary` parameter, and the server could not split the parts.

## Decision

1. A string body is sent as is when the request sets a `Content-Type` that is not a JSON media type
   (no `json` in it). Without a `Content-Type`, or with a JSON one, a string stays a JSON string value.
2. `defaultPathSerializer` throws when the serialized path has a `.` or `..` segment. A custom
   `pathSerializer` is not checked: its author owns the result.
3. `openapi-typesafe-fetch` keeps `error: undefined` for an empty error body; the docs tell users to check
   `response.ok` as well. `openapi-typesafe-react-query` treats a result as failed when `error !== undefined`
   or `!response.ok`, and throws `error` (`undefined` for an empty body), as upstream PR #2829 does.
4. The request id counter is module state shared by all clients, so ids are unique in the process. It holds no
   resource, needs no reset between tests (tests compare ids, never their values), and is the only module
   state of the client.
5. `TRACE` stays: removing a method is a breaking change, and the rejection is the platform's, with a clear
   message. Bun 1.4 does not reject it: it sends the request and returns an empty body. ADR-041
   (decision 5) lists each platform, and the API page documents it.
6. `FormData`, `Blob` (and `File`), `URLSearchParams`, `ArrayBuffer` and typed arrays or `DataView` are sent
   as they are, without the JSON `Content-Type`; the platform sets the right one (or none).
7. A form body with a nested object value throws and names `bodySerializer()`. Arrays and primitives keep the
   `URLSearchParams` encoding. The client does not pick one of the server conventions.
8. The query is joined with `&` when the path already has a `?`.
9. Query parameter names and object keys (query and path) are encoded with `encodeURIComponent`,
   except `[`, `]`, `$`, `:`, `@` and `,`, which are common in names (`filter[status]`, `$filter`) and do
   not split a URL. Names made of letters, digits and `-_.!~*'()` are unchanged. `allowReserved` still
   applies to values only, as in the OpenAPI specification.
10. With a `multipart/form-data` `Content-Type`, an object body becomes `FormData`: a `Blob` (or `File`) is a
    file part, a string as is, a number, boolean or bigint as its string, an array one part per item, and `null`
    or `undefined` is left out. A nested object throws and names `bodySerializer()`: a part with JSON needs its
    own content type, which the client does not guess (as in decision 7). For a `FormData` body, a
    `Content-Type` without a `boundary` parameter is removed, so the platform sets its own; one with a
    `boundary` is the user's and stays.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| String as is only for non-JSON media types (chosen) | Fixes `text/plain`; JSON requests unchanged | Users must set `Content-Type` for text bodies, as the schema already says |
| Every string as is (upstream #2761) | Simplest | Breaks JSON string values |
| Reject dot segments by default (chosen) | Closes a path traversal by default; no real API takes `..` as a value | A request that used to go out now rejects |
| Opt-in dot segment check | No behavior change | The unsafe default stays; most users never turn it on |
| Status text in `error` (upstream #2762) | `if (error)` works | Runtime value no longer matches the declared error type; breaks `error === undefined` checks |
| Keep `error: undefined`, fix react-query (chosen) | Types stay true; the hook layer, which owns success/failure, is fixed | `if (error)` in user code still misses empty error bodies (documented) |
| Per-client id counter | No shared module state | Ids collide across clients that share a middleware |
| Send raw bodies as they are (chosen) | Uploads work; matches what `fetch` does with them | A user who relied on `{}` (no one can) sees a change |
| Encode nested form values as `a[b]` | Works for PHP and Rails style servers | Silently wrong for servers that read `a.b` or JSON |
| Throw on nested form values (chosen) | No silent `[object Object]`; the fix is one `bodySerializer` | A request that used to go out (broken) now rejects |
| Multipart object bodies as `FormData` (chosen) | Uploads typed by `--binary-as-blob` work with one header | A request that was sent as JSON under a multipart header (which no server reads) changes |
| Keep JSON, document a `bodySerializer` (upstream) | No change | Every upload needs the same hand-written serializer |
| Encode names except name characters (chosen) | Closes parameter and segment injection; usual names unchanged | A name with `&`, `=`, `#`, `+`, `/`, `?`, `;`, `%` or a space is sent encoded |
| Encode names fully (`encodeURIComponent`) | Simplest | `filter[status]` and `$filter` change on the wire; some servers match the raw form |
| Keep names raw | No change | Data in keys can add parameters or path segments |

## Consequences

- Behavior changes are listed in the changesets as fixes with their upstream issues.
- The size budget holds: 7.47 kB after the changes. The dead Node.js version check in `supportsRequestInitExt`
  (every supported Node.js ships undici) was removed to pay for them.
- Decisions 6 to 8 add about 0.3 kB, and there is nothing left to remove without losing a behavior, so the
  budget rises from 7.5 kB to 8 kB (7.77 kB after the changes). Correctness ranks above size
  (CODING_PRINCIPLES §1); openapi-fetch 0.17.0 is about the same size without these fixes.
- Decision 9 adds about 0.13 kB (7.9 kB of 8 kB).
- Decision 10 adds about 0.39 kB (8.29 kB), so the budget rises to 8.5 kB. The code was already cut down
  (one shared error message, two regular expressions instead of a media type parser); the rest is the
  behavior itself.

## Amendment (2026-11-08): object keys are encoded without exceptions (decision 9)

The bug hunt on rc.3 (`RC4_BUGS.md`, item S3) showed that the name exceptions of decision 9 also
applied to object keys, which are data. With `explode: false`, a key `color,role,admin,x` and the
value `red` were sent as `color,role,admin,x,red`, and a server that splits the list into pairs read
`{ color: "role", admin: "x" }`. In a `deepObject`, a key `tag][role` was sent as
`filter[tag][role]=admin`, a nested member for bracket parsers. openapi-fetch 0.17 does not encode
keys at all.

1. Object keys are encoded as values are (`encodeURIComponent`), in every query and path style,
   with no exceptions: `,` `[` `]` `$` `:` `@` included. `allowReserved` does not apply to them.
2. Parameter names, the names a schema declares, keep the exceptions of decision 9, so
   `filter[status]` and `$filter` are sent unchanged.
3. Percent-encoding is all the client can do. A server that decodes the text before it splits it
   still reads such a key as structure: `qs`, the default query parser of Express, decodes
   `filter[tag%5D%5Brole]` to `filter[tag][role]`. No encoding of a style survives such a parser,
   and the client does not reject keys (see the table); the docs tell users to validate keys that
   come from end users. Such a key stays inside its own parameter.

| Option | Pros | Cons |
| --- | --- | --- |
| Encode object keys fully (chosen) | The text on the wire is the one RFC 6570 gives; a server that splits before it decodes reads the key | A key with `$`, `:` or `@` changes on the wire; decode-first parsers are still fooled |
| Keep the name exceptions for keys | No change | Data in a key adds members to its object |
| Throw on `[`, `]` or `,` in an object key | Fails closed for every parser | Rejects data that RFC 6570 encodes without trouble; breaks keys that servers read fine |

The change adds no bytes: keys use the value encoder.

## Amendment (2026-11-08): a FormData the client builds gets the platform's boundary (decision 10)

The bug hunt on rc.3 (`RC4_BUGS.md`, item F3) sent an object body with
`Content-Type: multipart/form-data; boundary=myboundary`. The client built the `FormData`, so the
platform wrote the parts with its own boundary, but decision 10 kept the user's header because it
named a boundary. The server read `myboundary` and could not split the parts.

1. When the client builds the `FormData` from an object (the default `bodySerializer` returned a
   new `FormData`), a `Content-Type` set by hand is removed, with or without a `boundary`, and the
   platform sets its own. No one but the platform knows that boundary.
2. For a `FormData` the user built (the body itself, or the result of their own
   `bodySerializer`), decision 10 stays: a `Content-Type` without a `boundary` is removed, one with
   a `boundary` is kept for a `fetch` of their own that writes the parts with it.

| Option | Pros | Cons |
| --- | --- | --- |
| Remove the header for a FormData the client built (chosen) | The header always matches the body the platform writes | none found: a hand-set boundary could never match that body |
| Remove a multipart header for every FormData | Simplest | A custom `fetch` that writes parts with a given boundary loses it |
| Build the parts with the user's boundary | Keeps the header | Needs a multipart writer in the client; the platform already has one |

## Amendment (2026-11-08): what a JSON media type is (decision 1)

Decision 1 called every `Content-Type` with `json` in it a JSON media type. The bug hunt on rc.3
(`RC4_BUGS.md`, item F4) found that a string body for `application/x-ndjson`, `application/jsonl`
or `application/json-seq` was JSON-encoded into one quoted string, so the server got no records.
openapi-fetch 0.17 does the same. These formats are lines of JSON texts, not one JSON text: a
string body is their payload.

1. A JSON media type is `application/json` or a media type with the `+json` structured syntax
   suffix (RFC 6838, section 4.2.8), such as `application/problem+json`, in any letter case, with
   or without parameters. Any other `Content-Type` sends a string body as is.
2. Without a `Content-Type`, a string is a JSON string value, as before.

| Option | Pros | Cons |
| --- | --- | --- |
| The `json` subtype or a `+json` suffix (chosen) | The registered rule; line-based formats work | A made-up type such as `application/x-json` sends a string as is |
| Keep "contains `json`" | No change | Every NDJSON or JSON Lines upload is broken |
| A list of line-based types | Names the known cases | Misses the next format; the RFC rule already covers them |

## Amendment (2026-11-08): stream bodies (decision 6)

The bug hunt on rc.3 (`RC4_BUGS.md`, item F5) found that a `ReadableStream` body, a valid fetch
body and the natural way to stream a `format: binary` upload, was JSON-encoded to `{}` with
`Content-Type: application/json`, as in openapi-fetch 0.17. The upload was lost without an error.

1. A `ReadableStream` is a raw body like the others of decision 6: sent as it is, without the
   JSON `Content-Type`.
2. The Fetch standard requires `duplex: "half"`, its only value, for a stream body: Node.js and
   Chromium throw without it. The client sets it for a stream body, before the client and request
   options, so a `duplex` the user passes still wins. Other bodies get no `duplex`.
3. Browsers differ in their support for stream request bodies; the docs say so and point to a
   `Blob`. The client does not detect support: the platform's error is clear.

| Option | Pros | Cons |
| --- | --- | --- |
| Send the stream, set `duplex: "half"` (chosen) | Works on Node.js, Deno and Bun with no extra option; what the standard asks | Bytes for the check |
| Send the stream, let the user set `duplex` | Fewer bytes | Every streamed upload fails on Node.js until the user finds the option |
| Throw for a stream body | Clear | Rejects a body that `fetch` supports |

## Review trigger

A user report of a real API that takes `.` or `..` as a path value, or a type-level redesign of `error`
(status-code narrowing, upstream #1970) for 2.0.
