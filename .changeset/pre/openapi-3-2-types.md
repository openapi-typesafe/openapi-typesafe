---
"openapi-typesafe": minor
---

OpenAPI 3.2 features are typed, with no flag (ADR-020): a path item's `query` operation becomes a
`query` member after `trace` (only where declared), `additionalOperations` a member keyed by the
exact method name, `itemSchema` an `itemContent` map next to `content` (which keeps the `schema`
type), an `in: querystring` parameter the `query` member of `parameters`, and
`components.mediaTypes` a `components` member that `content` entries can reference. Documents that
use none of these keep their output. The warnings for these features are gone; a `querystring`
parameter next to `in: query` parameters (not allowed in 3.2) still warns and is not typed.
`--make-paths-enum` and `--path-params-as-types` include the new operations. A discriminator
without `propertyName` (allowed in 3.2) no longer omits a property named `undefined`.

The Node API types gain `query`, `additionalOperations`, `itemSchema`, `in: "querystring"`,
`components.mediaTypes` and `discriminator.defaultMapping`. Upstream: openapi-typescript#2577,
PRs #2683, #2844, #2853.
