---
"openapi-typesafe": patch
---

Output that did not compile now compiles. Output that compiled is unchanged.

- `--enum`: empty values, quoted names, line breaks in descriptions, colliding member names and
  enums declared twice (upstream [#2807](https://github.com/openapi-ts/openapi-typescript/issues/2807), [#2812](https://github.com/openapi-ts/openapi-typescript/issues/2812), [#2614](https://github.com/openapi-ts/openapi-typescript/issues/2614), [#2838](https://github.com/openapi-ts/openapi-typescript/issues/2838)).
- `--enum-values`: readonly and nullable parents, arrays declared twice, colliding names, path item
  parameters and locations that cannot hold the values (upstream [#2714](https://github.com/openapi-ts/openapi-typescript/issues/2714), [#2749](https://github.com/openapi-ts/openapi-typescript/issues/2749)).
- Generated names: `--root-types` aliases that clash with an enum, a helper or a used global type
  get a number, invalid characters and reserved words are handled, and `--make-paths-enum` names
  are unique (upstream [#2099](https://github.com/openapi-ts/openapi-typescript/issues/2099), [#2341](https://github.com/openapi-ts/openapi-typescript/issues/2341), [#2206](https://github.com/openapi-ts/openapi-typescript/issues/2206)).
- Discriminated unions whose members `allOf` them (upstream [#1665](https://github.com/openapi-ts/openapi-typescript/issues/1665)); an inherited discriminator
  property declared again is written once.
- `--path-params-as-types` where a template also matches a path of another type (TS2411, TS2413,
  TS2374) (upstream [#1752](https://github.com/openapi-ts/openapi-typescript/issues/1752)).
- A `$ref` into another schema's keywords (`…/items/properties/time`, `…/allOf/0`).
- A `$ref` to a key with `~`, `/` or `%` in another file.
- `--exclude-deprecated` keeps a deprecated component that kept output still references.
