---
name: openapi-typesafe
description: Generate TypeScript types from an OpenAPI 3.x document with openapi-typesafe and call the API through openapi-typesafe-fetch or openapi-typesafe-react-query with fully inferred types. Use when a project depends on openapi-typesafe, openapi-typesafe-fetch or openapi-typesafe-react-query; when moving a project off openapi-typescript, openapi-fetch or openapi-react-query; when openapi-typescript fails with TypeScript 7; or when writing typed API calls, middleware, auth or error handling for an OpenAPI client.
license: MIT
---

# openapi-typesafe

openapi-typesafe turns an OpenAPI 3.0, 3.1 or 3.2 document into TypeScript types. It is a drop-in
successor to openapi-typescript 7.13 that also works with TypeScript 7. Four packages share one
version number:

| Package | Role | Replaces |
| :-- | :-- | :-- |
| `openapi-typesafe` | Generator: CLI and Node API (dev dependency) | `openapi-typescript` |
| `openapi-typesafe-fetch` | Typed `fetch` client, about 8 kB | `openapi-fetch` |
| `openapi-typesafe-react-query` | TanStack Query v5 hooks on top of the client | `openapi-react-query` |
| `openapi-typesafe-helpers` | Shared utility types | `openapi-typescript-helpers` |

Requirements: Node.js 22.12+ for the generator, Node.js 22+ (or a browser, Bun, Deno) for the
client, TypeScript 5.4 or newer (6.x and 7.x included).

Pick the task:

- New setup or typed calls: read on.
- Moving a project from openapi-typescript / openapi-fetch / openapi-react-query, or a
  TypeScript 7 error: [references/migration.md](references/migration.md).
- React components with TanStack Query: [references/react-query.md](references/react-query.md).
- Generator options, Node API, callbacks, error codes:
  [references/generator.md](references/generator.md).

## 1. Generate the types

```bash
npm i openapi-typesafe-fetch
npm i -D openapi-typesafe
npx openapi-typesafe ./openapi.yaml -o ./src/api/schema.d.ts
```

- Add a script, for example `"generate:api": "openapi-typesafe ./openapi.yaml -o ./src/api/schema.d.ts"`.
- The output exports `paths`, `components`, `operations` and `webhooks`. Never edit it by hand:
  change the OpenAPI document and regenerate.
- In CI, `openapi-typesafe ./openapi.yaml -o ./src/api/schema.d.ts --check` exits with `1` when the
  file is stale.
- Turn on `noUncheckedIndexedAccess` in `tsconfig.json`; additional properties are then typed as
  possibly `undefined`.

## 2. Create the client

```ts
import createClient from "openapi-typesafe-fetch";
import type { paths } from "./api/schema"; // generated file

export const client = createClient<paths>({ baseUrl: "https://api.example.com/v1" });
```

Create one client per base URL and reuse it. `createClient` also takes `headers` (sent with every
request), `fetch` (a custom fetch, used in tests), `querySerializer`, `bodySerializer` and any
`RequestInit` field such as `credentials`.

## 3. Call an endpoint

The path string must be the literal key from the document, with its `{placeholders}`. Never build
it at run time: type inference works only on the literal.

```ts
const { data, error, response } = await client.GET("/pets/{petId}", {
  params: {
    path: { petId: 42 },
    query: { include: "owner" },
  },
});

const created = await client.POST("/pets", {
  body: { name: "Rex", tag: "dog" },
});
```

- Methods are upper-case: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`.
- Parameters go under `params`, grouped by location: `path`, `query`, `header`, `cookie`.
  Never put a path or query value at the top level of the options.
- The request body is `body`, a plain object for JSON. The client serializes it; do not call
  `JSON.stringify` yourself.
- The client sends `Content-Type: application/json` unless you set another one; it does not read
  the media type from the document. For other bodies set the header in `headers`:
  - text: `body: notes, headers: { "Content-Type": "text/plain" }`; a string is then sent as is
    (with a JSON type it would be a JSON string, in quotes);
  - form: `headers: { "Content-Type": "application/x-www-form-urlencoded" }` with a plain object;
  - files (`multipart/form-data`): generate with `--binary-as-blob` (file fields become `Blob`),
    set `headers: { "Content-Type": "multipart/form-data" }` and pass the typed object as `body`;
    the client builds the `FormData` and `fetch` adds the boundary. Nested objects need a
    `bodySerializer`.
- The second argument is required only when the operation has required parameters or a required
  body.
- Do not pass generics to `GET` / `POST` and do not cast the result. Everything is inferred from
  `paths`; a cast hides the bugs the types exist to catch.
- `parseAs: "text" | "blob" | "arrayBuffer" | "stream"` changes how a success body is read
  (default `"json"`).
- Per-request `headers`, `signal`, `baseUrl` and `fetch` override the client options.

## 4. Handle the result

Every call resolves to `{ data, error, response }`. It does not throw for HTTP errors. It rejects
only when `fetch` itself fails (network error, CORS, abort) or a middleware throws.

| Field | Value |
| :-- | :-- |
| `data` | Parsed `2xx` body; `undefined` otherwise |
| `error` | Parsed `4xx` / `5xx` / `default` body; `undefined` otherwise |
| `response` | The original `Response` (`status`, `headers`, `ok`) |

An error response **without a body** has `error: undefined`, and so does any `204` or `HEAD`
response. So `if (error)` alone misses an empty `500`. Check `response.ok`:

```ts
const { data, error, response } = await client.GET("/pets/{petId}", {
  params: { path: { petId } },
});
if (!response.ok) {
  // `error` is the typed error body, or undefined when the server sent none.
  throw new ApiError(response.status, error);
}
return data; // typed as the 2xx body
```

- Narrow on `error` or `response.ok` before you read `data`; `data` and `error` are a
  discriminated union.
- Branch on `response.status` for status-specific handling; the `error` type is the union of all
  error bodies of the operation.
- A body that is not JSON comes back as text in `error`.
- Network failures and aborts reject: wrap the call in `try` / `catch` where you need to handle
  them, or turn them into a value with `onError` middleware (section 5).

## 5. Middleware

Middleware sees every request of a client. Register it with `client.use(...)` and remove it with
`client.eject(...)`.

```ts
import createClient, { type Middleware } from "openapi-typesafe-fetch";

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    request.headers.set("Authorization", `Bearer ${await tokens.current()}`);
    return request;
  },
};

client.use(authMiddleware);
```

- `onRequest({ request, schemaPath, params, id, options })`: return a `Request` to replace it,
  return a `Response` to skip the network (cache, mock), or return nothing to leave it as is.
- `onResponse({ request, response, ... })`: return a new `Response` to replace it, or nothing.
  To read the body, read `response.clone()`: the client still has to read the original.
- `onError({ error, ... })`: called when `fetch` throws. Return nothing to rethrow, an `Error` to
  throw that error instead, or a `Response` to recover.
- `onRequest` runs in registration order; `onResponse` runs in reverse order.
- `schemaPath` is the document path such as `"/pets/{petId}"`; use it to skip middleware for some
  endpoints (for example no auth header on `/auth/login`).
- Pass `middleware: [m]` in the options of a single call to apply it to that call only.
- Throwing in `onResponse` when `!response.ok` turns HTTP errors into rejections. Do this only
  when the caller wants exceptions (for example in a TanStack Query `queryFn` that does not use
  openapi-typesafe-react-query).

## 6. Reusable types

```ts
import type { components, operations, paths } from "./api/schema";

type Pet = components["schemas"]["Pet"];
type NewPet = paths["/pets"]["post"]["requestBody"]["content"]["application/json"];
type PetResponse =
  paths["/pets/{petId}"]["get"]["responses"][200]["content"]["application/json"];
type ListPetsQuery = operations["listPets"]["parameters"]["query"];
```

From `openapi-typesafe-helpers`: `PathsWithMethod<paths, "get">` (paths that have a GET),
`SuccessResponseJSON<Op>`, `ErrorResponseJSON<Op>`, `RequestBodyJSON<Op>`.
From `openapi-typesafe-fetch`: `MethodResponse<typeof client, "get", "/pets">` (the `data` type of
a call), `ClientPathsWithMethod<typeof client, "get">`.

## 7. Testing code that calls the client

Inject the client or its `fetch`, and answer with real `Response` objects. Do not mock the client
methods.

```ts
const requests: Request[] = [];
const client = createClient<paths>({
  baseUrl: "https://api.example.com/v1",
  fetch: async (request) => {
    requests.push(request);
    return Response.json({ id: 1, name: "Rex" }, { status: 200 });
  },
});
```

The `fetch` option receives one `Request`; read `request.url`, `request.method`,
`request.headers` and `await request.json()` in assertions. Mock Service Worker (`msw`) also
works.

## Common mistakes

| Mistake | Fix |
| :-- | :-- |
| `client.GET(\`/pets/${id}\`)` | `client.GET("/pets/{petId}", { params: { path: { petId: id } } })` |
| `client.get(...)` | Methods are upper-case on the client: `client.GET(...)`; lower-case only in react-query hooks (`$api.useQuery("get", ...)`) |
| `{ query: { limit: 10 } }` at the top level | `{ params: { query: { limit: 10 } } }` |
| `body: JSON.stringify(pet)` | `body: pet` |
| `if (error) ...` as the only failure check | `if (!response.ok) ...`; `error` is `undefined` for an empty error body |
| `try { await client.GET(...) } catch` to catch a 404 | HTTP errors resolve; they do not throw. Check `response.ok` |
| `client.GET<Pet>(...)`, `data as Pet` | Remove the generic and the cast; fix the document if the type is wrong |
| Reading `data` without narrowing | Check `error` / `response.ok` first, or use `data!` only after that check |
| Editing the generated `schema.d.ts` | Change the OpenAPI document, regenerate |
| `import ... from "openapi-fetch"` / `"openapi-typescript"` | The packages are `openapi-typesafe-fetch` / `openapi-typesafe`; see the migration reference |
| `await response.json()` in `onResponse` | Read `response.clone().json()`; the client reads the original |
| A new client per request | Create the client once per base URL and reuse it |
| Installing `typescript@5` only to run the generator | Not needed: the generator has no TypeScript dependency |
