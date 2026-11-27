# Client hardening (task 7.6)

> What task 7.6 reviewed in `openapi-typesafe-fetch`, `openapi-typesafe-react-query` and
> `openapi-typesafe-helpers`, what it fixed, and what it left for later. Source: `research/backlog.md`, section 5.
> Decisions: ADR-013 (runtime behavior) and ADR-014 (`Readable` / `Writable`).

## Fixed

| Candidate | Upstream issues | Package | Decision | Change |
|---:|---|---|---|---|
| 12 | #2555, #2382, #2761 | fetch | ADR-013 §1 | String bodies are sent as is for a non-JSON `Content-Type` |
| 15 | #2483 | fetch | ADR-013 §2 | A path parameter that makes a `.` / `..` segment rejects the request |
| 11 | #2070, #2531, #2829 | react-query | ADR-013 §3 | Every non-OK response fails the query or mutation |
| 11 | #2530, #2762 | fetch | ADR-013 §3 | Not changed: `error` stays `undefined`; docs say to check `response.ok` |
| 10 | #2615, #2620, #2632, #2717, #2765 | helpers, generator | ADR-014 | `Readable` / `Writable` keep primitives, arrays, tuples, null-only keys |

Also found in the review:

- `TRACE` always rejects: the Fetch standard forbids it in `new Request()` (ADR-013 §5). Kept, covered by a test.
- `supportsRequestInitExt` checked for Node.js 18, which every supported Node.js passes. Removed; it paid for the
  bytes of the fixes.

## Size budget

`dist/index.mjs` of `openapi-typesafe-fetch`: 7.39 kB before, 7.47 kB after (budget 7.5 kB, size-limit 14,
minified, not compressed).

## Not taken

| Item | Why |
|---|---|
| #2726 root types with markers do not match `data` / `body` | Needs resolved root type variants from the generator: a feature (ADR-014 §5) |
| #1970 status-code narrowing | Conflicts with the current client API; a 2.0 topic |
| #2257, #2127, #2383, #2238 response status and headers in react-query | Additive features that need one design for all four |
| #2487, #2484 `mutationOptions` / `infiniteQueryOptions` | Additive features |
| #2852 … #2865 react-query type fixes (candidate 23) | Several make types stricter and can break compiling code; need an opt-in or a major-version note |
