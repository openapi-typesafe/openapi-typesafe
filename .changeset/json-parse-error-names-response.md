---
"openapi-typesafe-fetch": patch
---

A success body that is not JSON, such as the HTML page of a proxy, throws a `SyntaxError` that
names the status, the `Content-Type` and the length of the body and says which `parseAs` to set
(`parseAs: "text"` for a `text/*` response), instead of a bare parser error. The error holds no
body text, which can be a secret such as an OAuth token: the parser's error, whose message quotes
the body, is not kept as `cause` either.
