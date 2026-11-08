---
"openapi-typesafe-fetch": patch
---

A success body that is not JSON, such as the HTML page of a proxy, throws a `SyntaxError` that
names the status, the `Content-Type` and the first 100 characters of the body and says which
`parseAs` to set (`parseAs: "text"` for a `text/*` response), with the parser's error as `cause`,
instead of a bare parser error (audit finding F7, ADR-041).
