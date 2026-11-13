---
"openapi-typesafe": patch
---

The Node API now rejects options of the wrong type with `OPTION_INVALID` before anything runs: a
Redocly config that was not made with `createConfig` or `loadConfig` (such as `{ extends: [...] }`),
an `inject` that is no string, a callback that is no function, and a boolean option that is not
`true` or `false`. A Redocly config or `inject` of the wrong type used to reject with a plain
`TypeError`, and `enum: "false"` turned enums on.
