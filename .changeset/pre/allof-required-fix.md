---
"openapi-typesafe": minor
---

New `--fix` option (`fix` in the Node API and in `redocly.yaml`) for opt-in fixes of the output of
valid schemas (ADR-021). Give fix names, comma-separated, or `all` for every fix of the installed
version; an unknown name fails with `OPTION_FIX_UNKNOWN`. Without it the output does not change.
The fixes become the default in 2.0.

The first fix, `allof-required`: an `allOf` member with only `required` (and `type: object` or
annotations), inline or behind a `$ref`, no longer adds `& Record<string, never>` or `& unknown`;
its keys become required in the other members, so `Info & Record<string, never>` is now
`WithRequired<Info, "name">` (openapi-typescript #1474, #1520, #2165). An empty `type: object`
member is left out too.
