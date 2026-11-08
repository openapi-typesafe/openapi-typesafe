---
"openapi-typesafe": minor
---

New `--fix` option (`fix` in the Node API and `redocly.yaml`): opt-in fixes of the output of valid
schemas, by name or `all`. Without it the output does not change; the fixes are planned as the
default in 2.0. The names are exported as the `OutputFix` type, the `OUTPUT_FIXES` list and
`OutputFixName` (a fix name or `"all"`).

- `allof-discriminated-union`: an `allOf` `$ref` to a discriminated union is that union, without
  `Omit` (upstream [#1464](https://github.com/openapi-ts/openapi-typescript/issues/1464), [#1690](https://github.com/openapi-ts/openapi-typescript/issues/1690)).
- `allof-required`: an `allOf` member with only `required` makes those keys required (upstream
  [#1474](https://github.com/openapi-ts/openapi-typescript/issues/1474), [#1520](https://github.com/openapi-ts/openapi-typescript/issues/1520), [#2165](https://github.com/openapi-ts/openapi-typescript/issues/2165)).
- `anyof-oneof-descriptions`: the JSDoc lists the descriptions of `anyOf`/`oneOf` members
  (upstream [#2142](https://github.com/openapi-ts/openapi-typescript/issues/2142)).
- `anyof-oneof-required`: `required`-only variants make the parent's keys required, not `unknown`.
- `anyof-properties`: `anyOf` next to `properties` is intersected with them (upstream [#2380](https://github.com/openapi-ts/openapi-typescript/issues/2380)).
- `array-length-tuples`: correct `--array-length` tuples (upstream [#2048](https://github.com/openapi-ts/openapi-typescript/issues/2048), [#2330](https://github.com/openapi-ts/openapi-typescript/issues/2330),
  [#2546](https://github.com/openapi-ts/openapi-typescript/issues/2546)).
- `dedupe-enum-names`: `--dedupe-enums` names do not depend on document order (upstream
  [#1683](https://github.com/openapi-ts/openapi-typescript/issues/1683)).
- `discriminator-member-required`: `required` next to an `allOf` `$ref` to a discriminator member
  is kept (upstream [#2162](https://github.com/openapi-ts/openapi-typescript/issues/2162)).
- `discriminator-values`: a discriminator member gets one value, with `--enum` a member of the
  owner's enum (upstream [#2200](https://github.com/openapi-ts/openapi-typescript/issues/2200), [#2124](https://github.com/openapi-ts/openapi-typescript/issues/2124), [#1700](https://github.com/openapi-ts/openapi-typescript/issues/1700)).
- `exploded-query-objects`: the properties of an exploded object query parameter are keys of
  `query` (upstream [#2361](https://github.com/openapi-ts/openapi-typescript/issues/2361)).
- `nullable-enums`: `--enum` declares an enum that lists `null`, typed `E | null` (upstream
  [#1872](https://github.com/openapi-ts/openapi-typescript/issues/1872)).
- `path-param-type-names`: a path parameter named `number`, `string` or `boolean` gets its own
  placeholder.
- `prefix-items`: `prefixItems` tuples follow JSON Schema 2020-12 (upstream [#1892](https://github.com/openapi-ts/openapi-typescript/issues/1892)).
- `read-write-refs`: `readOnly`/`writeOnly` of a referenced schema count (upstream [#1938](https://github.com/openapi-ts/openapi-typescript/issues/1938)).
- `ref-pointers`: a `$ref` into another schema's keywords is typed also where it was `unknown`.
- `root-type-numbering`: every schema of one root type name gets an alias (`PetStore_2`).
- `unevaluated-properties`: `unevaluatedProperties` is typed (upstream [#2839](https://github.com/openapi-ts/openapi-typescript/issues/2839), [#2880](https://github.com/openapi-ts/openapi-typescript/issues/2880)).
