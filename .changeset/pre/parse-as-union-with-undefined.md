---
"openapi-typesafe-fetch": patch
---

A `parseAs` typed as a union with `undefined`, such as `"text" | undefined` passed on by a wrapper,
now types `data` as both bodies (`string` or the JSON body). It gave the JSON body only, while the
client reads the body as text when `parseAs` is `"text"`. `undefined` stays the default `"json"`.
