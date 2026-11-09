---
"openapi-typesafe": patch
---

Output that did not compile now compiles. Without `--fix`, output that compiled changes only as
listed under Major Changes.

- `--enum`: empty values, quoted names, line breaks in descriptions, colliding member names and
  enums declared twice (upstream [#2807](https://github.com/openapi-ts/openapi-typescript/issues/2807), [#2812](https://github.com/openapi-ts/openapi-typescript/issues/2812), [#2614](https://github.com/openapi-ts/openapi-typescript/issues/2614), [#2838](https://github.com/openapi-ts/openapi-typescript/issues/2838)).
- `--enum-values`: readonly and nullable parents, arrays declared twice, colliding names, path item
  parameters and locations that cannot hold the values (upstream [#2714](https://github.com/openapi-ts/openapi-typescript/issues/2714), [#2749](https://github.com/openapi-ts/openapi-typescript/issues/2749)).
- Generated names: a `--root-types` alias or an `--enum` enum that clashes with another
  declaration, a helper type or a global type the output uses gets a number (`Record_2`,
  `ApiPaths_2`; also next to `ApiPaths`, a root interface, a `--read-write-markers` type or a type
  in `inject`), invalid characters and reserved words are handled, and `--make-paths-enum` names
  are unique (upstream [#2099](https://github.com/openapi-ts/openapi-typescript/issues/2099), [#2341](https://github.com/openapi-ts/openapi-typescript/issues/2341), [#2206](https://github.com/openapi-ts/openapi-typescript/issues/2206)).
- Discriminated unions whose members `allOf` them (upstream [#1665](https://github.com/openapi-ts/openapi-typescript/issues/1665)); an inherited discriminator
  property declared again is written once.
- `--path-params-as-types` where a template also matches a path of another type (TS2411, TS2413,
  TS2374) (upstream [#1752](https://github.com/openapi-ts/openapi-typescript/issues/1752)).
- A `$ref` into another schema's keywords (`…/items/properties/time`, `…/allOf/0`).
- A parameter `$ref` to another operation's parameter (`#/paths/~1a/get/parameters/0`) where all
  parameters of its location are optional, and to an OpenAPI 3.2 `in: querystring` parameter.
- A `$ref` to a key with `~`, `/` or `%` in another file.
- Operations with a repeated `operationId` get distinct keys in `operations` (TS2300): the first
  in document order keeps the ID and each later one gets the lowest free number from 2
  (`listItems2`, also its `--make-paths-enum` name). The `LINT_PROBLEM` warning stays.
- `--exclude-deprecated` keeps a deprecated component that kept output still references.
