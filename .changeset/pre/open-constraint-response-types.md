---
"openapi-typesafe-fetch": patch
"openapi-typesafe-helpers": patch
---

Code generic in its paths or its operation no longer gets `data` and `error` that fit any type.
With `Paths extends Record<string, any>`, `Paths extends Record<string, Record<HttpMethod, {}>>`,
`Op extends { responses: any }` or `Op extends OperationObject`, the response types are `unknown`
inside such code, so it must check a value before it uses it; its callers still get the bodies of
their operations. Generic code should name a result's types by `FetchResponse<…>["data"]` and
`FetchResponse<…>["error"]`, as `Readable<ErrorResponse<ResponseObjectMap<Op>>>` no longer relates
to them.
