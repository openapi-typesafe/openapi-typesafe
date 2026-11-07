# openapi-typesafe

Generate TypeScript types from [OpenAPI 3.0, 3.1 and 3.2](https://spec.openapis.org/oas/latest.html) schemas.
Runs on Node.js; no Java, no running server, no runtime code in the output.

A maintained, drop-in successor to `openapi-typescript` (see the [repository README](../../README.md)).

> **Release candidate.** The current version is a 1.0.0 release candidate (`1.0.0-rc.N`);
> names and output can still change before 1.0.0.

## Features

- OpenAPI 3.0, 3.1 and 3.2, including discriminators, `oneOf` / `anyOf` / `allOf`, and `$ref` across files.
- Runtime-free output: only types.
- Local or remote schemas, YAML or JSON.
- Swagger 2.0 is not supported.

## Setup

Requires Node.js 22.12 or newer. TypeScript 5.4 or newer, including 6 and 7, type-checks the output.

```sh
npm i -D openapi-typesafe typescript
```

Recommended `tsconfig.json` settings:

```jsonc
{
  "compilerOptions": {
    "module": "ESNext", // or "NodeNext"
    "moduleResolution": "Bundler", // or "NodeNext"
    "noUncheckedIndexedAccess": true
  }
}
```

## Usage

```sh
# Local schema
npx openapi-typesafe ./path/to/schema.yaml -o ./path/to/schema.d.ts

# Remote schema
npx openapi-typesafe https://example.com/api/v1/openapi.yaml -o ./path/to/schema.d.ts
```

Then import the types:

```ts
import type { components, paths } from "./path/to/schema";

type User = components["schemas"]["User"];
type GetUserResponse = paths["/users/{id}"]["get"]["responses"][200]["content"]["application/json"];
```

With `"moduleResolution": "NodeNext"`, write the extension: `"./path/to/schema.js"`.

Run `npx openapi-typesafe --help` for all options. Generated examples for real APIs are in [`examples/`](./examples).

## Migrating from openapi-typescript

Replace the package and the binary name; the options and the types are the same.

```diff
- npx openapi-typescript ./schema.yaml -o ./schema.d.ts
+ npx openapi-typesafe ./schema.yaml -o ./schema.d.ts
```

The header of generated files names the new generator, so regenerate and commit the output once.

## Versioning

Semantic versioning from 1.0.0, with one version for all openapi-typesafe packages. What the
version promises, and what may grow in a minor release, is listed under
[Versioning](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/compatibility.md#versioning).

## License

[MIT](./LICENSE)
