---
"openapi-typesafe": patch
---

`--path-params-as-types` with a path parameter named `number`, `string` or `boolean`, such as
`/invoices/{id}/lines/{number}`, now gives the same key as openapi-typescript 7.13,
`` `/invoices/$${number}/lines/{number}` ``: the original replaces the first `{number}` in the
key, which is in the placeholder of `{id}`. The rc gave every parameter its own placeholder; that
key is now the new opt-in fix `path-param-type-names` (`--fix=path-param-type-names`), since both
outputs compile.
