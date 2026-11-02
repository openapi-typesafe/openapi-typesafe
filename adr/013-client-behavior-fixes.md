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
   message.

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

## Consequences

- Behavior changes are listed in the changesets as fixes with their upstream issues.
- The size budget holds: 7.47 kB after the changes. The dead Node.js version check in `supportsRequestInitExt`
  (every supported Node.js ships undici) was removed to pay for them.

## Review trigger

A user report of a real API that takes `.` or `..` as a path value, or a type-level redesign of `error`
(status-code narrowing, upstream #1970) for 2.0.
