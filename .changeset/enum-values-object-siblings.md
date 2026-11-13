---
"openapi-typesafe": patch
---

`--enum-values`: an array whose schema sits next to an object, an array or a tuple in an `anyOf`
/ `oneOf` (or a `prefixItems` tuple) is now typed by its own values. Before, an enum `[a, b]` next
to `{ type: object }` typed the items of `["a", "b"]` as `"a" | "b" | Record<string, never>`, so a
string method on an item did not compile. It is now `ReadonlyArray<"a" | "b">`.
