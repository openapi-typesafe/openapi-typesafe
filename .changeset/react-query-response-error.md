---
"openapi-typesafe-react-query": major
---

A query or mutation that fails without an error body (an empty `503` from a proxy, or a status
whose operation declares no content) throws a `ResponseError` with `status` and `response`
instead of `undefined`, so `error` is never `undefined` once a query failed and `if (error)` sees
the failure. The error type of every hook and of `queryOptions` is now the error body or
`ResponseError` (exported types `ResponseError` and `QueryError`): narrow with
`error instanceof Error` before you read a field of the body; `error.message` still compiles.
The message names the status, not the URL (ADR-013).
