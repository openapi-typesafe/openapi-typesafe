# openapi-typesafe-helpers

Type helpers for the types that openapi-typesafe generates (for example `PathsWithMethod`,
`SuccessResponse`, `ErrorResponse`, `MediaType`). Types only; no runtime code.

`openapi-typesafe-fetch` declares the helper types in its `helpers` entry, and this package
re-exports them, so it depends on the client. The names of both packages are one declaration: a
value typed with one fits the other, also in generic code. A library built with
`declaration: true` under Yarn PnP that depends only on this package and exports an inferred type
that prints a helper type gets `import("openapi-typesafe-fetch/helpers")` in its declarations: add
`openapi-typesafe-fetch` to its dependencies, or annotate the type.

A maintained successor to `openapi-typescript-helpers` (see the [repository README](../../README.md)).
Most projects do not need to install it directly.

> **Release candidate.** The current version is a 1.0.0 release candidate (`1.0.0-rc.N`);
> names and output can still change before 1.0.0.

## Versioning

Semantic versioning from 1.0.0, with one version for all openapi-typesafe packages. What the
version promises, and what may grow in a minor release, is listed under
[Versioning](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/compatibility.md#versioning).

## License

[MIT](./LICENSE)
