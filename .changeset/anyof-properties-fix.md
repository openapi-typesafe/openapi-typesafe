---
"openapi-typesafe": minor
---

New output fix `anyof-properties` (`--fix anyof-properties`, ADR-021): `anyOf` next to
`properties`, `additionalProperties` or `allOf` is intersected with them, so
`{ name?: string } | Email | Phone` is now `{ name?: string } & (Email | Phone)` and a value must
match a variant (openapi-typescript #2380); `type: string` with `anyOf` enums becomes
`string & ("a" | "b")`. With a `type` list, each listed type is intersected
and `null` is kept. Without the fix the output does not change; `--fix all` now includes it.
