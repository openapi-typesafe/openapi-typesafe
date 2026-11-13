---
"openapi-typesafe-react-query": patch
---

A typed array inside a JSON body is keyed as JSON sends it. It was keyed by its bytes, so
`{ a: new Uint8Array([0, 1]) }` and `{ a: new Uint16Array([256]) }` shared a query key although
they send `{"a":{"0":0,"1":1}}` and `{"a":{"0":256}}`. A whole bytes body is still keyed by its
bytes.
