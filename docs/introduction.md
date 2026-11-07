---
title: openapi-typesafe
description: Quickstart
---

# openapi-typesafe

openapi-typesafe turns [OpenAPI 3.x](https://spec.openapis.org/oas/latest.html) documents into TypeScript types with Node.js. No Java, no node-gyp, no running OpenAPI server.

It is a drop-in successor to [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) 7.13, with the same CLI flags and the same Node API. Its output is compared with openapi-typescript's on 1,820 real-world documents with 28 option sets (50,960 cases): 99.99% of the outputs are the same byte for byte and 100% have the same types ([compatibility report](./compatibility.md)). The [migration guide](/migration-guide) lists the changes: output that did not compile or had wrong types, and open string enums, a change merged upstream after 7.13.0. The difference is inside: openapi-typesafe prints types itself instead of through the TypeScript compiler API, so it works in projects on TypeScript 7 (see [TypeScript 7](/typescript-7)). Coming from openapi-typescript? See the [migration guide](/migration-guide).

::: info Release candidate
The current version is a 1.0.0 release candidate (`1.0.0-rc.N`); names and output can still
change before 1.0.0.
:::

The code is [MIT-licensed](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/LICENSE) and free to use.

::: tip

New to OpenAPI? Speakeasy’s [Intro to OpenAPI](https://www.speakeasyapi.dev/openapi) explains the “why” and “how” of OpenAPI.

:::

## Features

- Supports OpenAPI 3.0, 3.1 and 3.2 (including advanced features like [discriminators](https://spec.openapis.org/oas/v3.1.0#discriminator-object); see [OpenAPI 3.2 features](#openapi-3-2-support))
- Generates **runtime-free types**
- Loads documents from YAML or JSON, locally or remotely
- Generates types for large documents in milliseconds
- Works with TypeScript 5.4 and newer, including 6 and 7; the generator itself needs no TypeScript package

OpenAPI 2.x (Swagger) is not supported.

<a id="openapi-3-2-support"></a>

### OpenAPI 3.2 features

A 3.2 document generates the same types as a 3.1 document with the same content, plus types for
the 3.2 additions. A document that uses none of them gets the same output as before.

| 3.2 feature | Generated types |
| --- | --- |
| `query` operation | a `query` member after `trace`, only in path items that have one; `client.QUERY()` calls it |
| `additionalOperations` | an `additionalOperations` member keyed by the exact method name (`SUBSCRIBE`); the operations are typed, the clients do not call them |
| `itemSchema` | an `itemContent` map next to `content`, with the type of one item per media type; `content` keeps the `schema` type (or `unknown`) |
| `in: querystring` | the schema of its `content` becomes `parameters.query` |
| `components.mediaTypes` | a `mediaTypes` member of `components`, and `content` entries that reference it |

```ts
"/trips": {
  // …
  trace?: never;
  additionalOperations: {
    SUBSCRIBE: operations["subscribe-trip"];
  };
};
// operations["subscribe-trip"]["responses"][200]
{
  headers: { [name: string]: unknown };
  content: { "application/jsonl": unknown };
  itemContent: { "application/jsonl": components["schemas"]["TripUpdate"] };
}
```

`itemContent` is not the response `data`: a stream such as `application/jsonl` is read with
`parseAs: "stream"` and split into items by your code, which can use the item type.

A `querystring` parameter is sent with the client's `querySerializer`, which writes form fields
(`application/x-www-form-urlencoded`). For another media type, such as JSON in the query string,
pass your own [`querySerializer`](/fetch/api#queryserializer). 3.2 does not allow `in: query`
parameters next to a `querystring` parameter; if a document has both, the `query` parameters are
typed, and the generator warns about the `querystring` parameter with its JSON Pointer.

Other 3.2 additions do not change types: `$self`, `itemEncoding`, `prefixEncoding`, tag `parent`
and `kind`, and `discriminator.defaultMapping` (the default schema still gets its own name as the
discriminator value). A discriminator without `propertyName` adds no property type.

## Examples

[See examples](https://github.com/openapi-typesafe/openapi-typesafe/blob/main/packages/openapi-typesafe/examples/)

## Setup

openapi-typesafe needs [Node.js](https://nodejs.org) 22.12 or newer. In your project, run:

```bash
npm i -D openapi-typesafe
```

And in your `tsconfig.json`, to load the types properly:

::: code-group

```json [tsconfig.json]
{
  "compilerOptions": {
    "module": "ESNext", // or "NodeNext" // [!code ++]
    "moduleResolution": "Bundler" // or "NodeNext" // [!code ++]
  }
}
```

:::

::: tip Highly recommended

Also adding the following can boost type safety:

::: code-group

```json [tsconfig.json]
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true // [!code ++]
  }
}
```

:::

## Basic usage

First, generate a local type file by running `npx openapi-typesafe`, first specifying your input document (JSON or YAML), and where you’d like the `--output` (`-o`) to be saved:

```bash
# Local document
npx openapi-typesafe ./path/to/my/schema.yaml -o ./path/to/my/schema.d.ts

# Remote document
npx openapi-typesafe https://myapi.dev/api/v1/openapi.yaml -o ./path/to/my/schema.d.ts
```

Then in your TypeScript project, import types where needed:

::: code-group

```ts [src/my-project.ts]
import type { paths, components } from "./my-openapi-3-schema"; // generated by openapi-typesafe

// Schema Obj
type MyType = components["schemas"]["MyType"];

// Path params
type EndpointParams = paths["/my/endpoint"]["parameters"];

// Response obj
type SuccessResponse =
  paths["/my/endpoint"]["get"]["responses"][200]["content"]["application/json"];
type ErrorResponse =
  paths["/my/endpoint"]["get"]["responses"][500]["content"]["application/json"];
```

:::

With `"moduleResolution": "NodeNext"`, write the extension: `"./my-openapi-3-schema.js"`.

From here, you can use these types for any of the following (but not limited to):

- Using an OpenAPI-supported fetch client (like [openapi-typesafe-fetch](/fetch/))
- Asserting types for other API request bodies and responses
- Building core business logic based on API types
- Validating mock test data is up-to-date with the current schema
- Packaging API types into any npm packages you publish (such as client SDKs, etc.)
