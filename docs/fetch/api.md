---
title: API
description: Every option and export of openapi-typesafe-fetch, such as createClient, request options, serializers and middleware
---

# API

## createClient

**createClient** accepts the following options, which set the default settings for all subsequent fetch calls.

```ts
createClient<paths>(options);
```

| Name              | Type            | Description                                                                                                                             |
| :---------------- | :-------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`         | `string`        | Prefix all fetch URLs with this option (e.g. `"https://myapi.dev/v1/"`)                                                                 |
| `fetch`           | `fetch`         | Fetch instance used for requests (default: `globalThis.fetch`)                                                                          |
| `Request`         | `Request`       | Request class the client builds requests with (default: `globalThis.Request`)                                                           |
| `FormData`        | `FormData`      | FormData class of multipart bodies, of the same implementation as `Request` (default: `globalThis.FormData`)                            |
| `querySerializer` | QuerySerializer | (optional) Provide a [querySerializer](#queryserializer)                                                                                |
| `bodySerializer`  | BodySerializer  | (optional) Provide a [bodySerializer](#bodyserializer)                                                                                  |
| `pathSerializer`  | PathSerializer  | (optional) Provide a [pathSerializer](#pathserializer)                                                                                  |
| `requestInitExt`  | `Record<string, unknown>` | (optional) Passed as the second argument to `fetch`, for options of Node.js's fetch (undici) such as `dispatcher`; other platforms ignore it |
| (Fetch options)   |                 | Any valid fetch option (`headers`, `mode`, `cache`, `signal` …) ([docs](https://developer.mozilla.org/en-US/docs/Web/API/fetch#options) |

The client has the methods of the [fetch options](#fetch-options) (`GET`, `POST`, … and `request`),
`use` and `eject` for [middleware](#middleware), and `baseUrl`: the `baseUrl` option without its
trailing slash, or `""` without one. `openapi-typesafe-react-query` puts it into its query keys.

### Another fetch implementation

`fetch` and `Request` of another Fetch API implementation, such as the `undici` package, are typed
by that package, not by the DOM lib, so TypeScript cannot relate them to `Request` and `Response`.
`createClient` and `createPathBasedClient` take them anyway (`CustomFetchClientOptions`) and check
only that `fetch` returns a promise and `Request` is a class. Pass `fetch`, `Request` and
`FormData` from the same package: the undici `fetch` reads a request of another class as the URL
`[object Request]`, and its `Request` reads a FormData of another class as the text
`[object FormData]`. The client builds multipart bodies with the `FormData` option and copies a
FormData body of another class into one of it.

```ts
import { FormData, fetch, Request } from "undici";

const client = createClient<paths>({ baseUrl: "https://myapi.dev/v1/", fetch, Request, FormData });
```

A body is told by its type tag (`Symbol.toStringTag`), not by `instanceof`, so a FormData, a Blob or
a `ReadableStream` of another realm (an iframe) or implementation is sent as it is.

### TRACE

The client has `TRACE()` because OpenAPI has `trace` operations, but the
[Fetch standard](https://fetch.spec.whatwg.org/#forbidden-method) forbids the method, so what
happens depends on the platform:

| Platform | `client.TRACE()` |
| :------- | :--------------- |
| Browsers (as the standard says), Node.js, Deno | rejects with the platform's `TypeError` before anything is sent (Node.js: `'TRACE' HTTP method is unsupported.`, Deno: `Method is forbidden`) |
| Bun (1.4) | sends the request, but the response body is always empty, so `data` is `undefined` |

Node.js 24, Bun 1.4.4 and Deno 2.9.6 were checked against a server that answers `TRACE` with a body. Use another HTTP client for `TRACE` if you need
its response body.

## Fetch options

The following options apply to all request methods (`.GET()`, `.POST()`, etc.)

```ts
client.GET("/my-url", options);
```

| Name              | Type                                                              | Description                                                                                                                                                                                                                       |
| :---------------- | :---------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `params`          | ParamsObject                                                      | [path](https://swagger.io/specification/#parameter-locations) and [query](https://swagger.io/specification/#parameter-locations) params for the endpoint                                                                          |
| `body`            | `{ [name]:value }`                                                | [requestBody](https://spec.openapis.org/oas/latest.html#request-body-object) data for the endpoint                                                                                                                                |
| `querySerializer` | QuerySerializer                                                   | (optional) Provide a [querySerializer](#queryserializer)                                                                                                                                                                          |
| `bodySerializer`  | BodySerializer                                                    | (optional) Provide a [bodySerializer](#bodyserializer)                                                                                                                                                                            |
| `pathSerializer`  | PathSerializer                                                    | (optional) Provide a [pathSerializer](#pathserializer)                                                                                                                                                                            |
| `parseAs`         | `"json"` \| `"text"` \| `"arrayBuffer"` \| `"blob"` \| `"stream"` | (optional) Parse the response using [a built-in instance method](https://developer.mozilla.org/en-US/docs/Web/API/Response#instance_methods) (default: `"json"`). `"stream"` skips parsing altogether and returns the raw stream. |
| `baseUrl`         | `string`                                                          | Prefix the fetch URL with this option (e.g. `"https://myapi.dev/v1/"`)                                                                                                                                                            |
| `fetch`           | `fetch`                                                           | Fetch instance used for requests (default: fetch from `createClient`)                                                                                                                                                             |
| `middleware`      | `Middleware[]`                                                    | [See docs](/fetch/middleware-auth)                                                                                                                                                                                        |
| (Fetch options)   |                                                                   | Any valid fetch option (`headers`, `mode`, `cache`, `signal`, …) ([docs](https://developer.mozilla.org/en-US/docs/Web/API/fetch#options))                                                                                         |

### Response body

As in openapi-fetch, a success body is parsed as JSON unless `parseAs` says otherwise, whatever
its `Content-Type`; a `text/plain` response needs `parseAs: "text"`. A success body that is not
JSON (for example the HTML page of a proxy) throws a `SyntaxError` that names the status, the
`Content-Type` and the length of the body, and says which `parseAs` to set (`parseAs: "text"` for
a `text/*` response). The error holds no body text, since a body can hold a secret (a form-encoded
OAuth token answer) and errors reach logs, so it has no `cause` either: the parser's message quotes
the body. Read `response` with `parseAs: "text"` to see it. An error
response (`4xx`, `5xx`) whose body is not JSON gives the text as `error` instead of throwing.

An empty body (a 204, an answer to HEAD, a `Content-Length` of 0) is `undefined` data with the
default `parseAs: "json"` and an `undefined` error. Another `parseAs` reads it with its method, as
its type says: `""` for `"text"`, an empty `Blob` or `ArrayBuffer`, and `response.body` for
`"stream"` (`null` for a 204).

### Headers

`headers` can be set on the client, on a request, and as `params.header`; for the same name the
request wins over the client, and `params.header` over both. They can be a `Headers` object, a
list of `[name, value]` pairs or a record. A record value can be a string, a number, a boolean or
an array of them (each item is appended), and `null` removes a header set at a lower level.

`params.header` values are written in the `simple` style, the only style OpenAPI has for headers,
as a `simple` path parameter but not percent-encoded:

| Value | Sent as |
| :---- | :------ |
| `new Date(0)` | `1970-01-01T00:00:00.000Z` (ISO 8601, UTC) |
| `["a", "b"]` | `a,b` |
| `{ role: "admin", page: 2 }` | `role,admin,page,2` |
| `[]`, `{}` | no header |
| `null` | removes the header set in `headers` |

An exploded object header (`role=admin,page=2`) needs a string value: the client does not know the
`explode` of a header.

::: info Cookie parameters

`params.cookie` is typed but not sent, as in openapi-fetch. Browsers do not let scripts set the
`Cookie` header; they send their own cookies when `credentials` allows it. On a server, set the
`Cookie` header in `headers` yourself.

:::

## wrapAsPathBasedClient

**wrapAsPathBasedClient** wraps the result of `createClient()` to return a [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)-based client that allows path-indexed calls:

```ts
const client = createClient<paths>(clientOptions);
const pathBasedClient = wrapAsPathBasedClient(client);

pathBasedClient["/my-url"].GET(fetchOptions);
```

The `fetchOptions` are the same as for the base client.

A path based client can lead to better type inference but comes at a runtime cost due to the use of a Proxy.

**createPathBasedClient** is a convenience method combining `createClient` and `wrapAsPathBasedClient` if you only want to use the path based call style:

```ts
const client = createPathBasedClient<paths>(clientOptions);

client["/my-url"].GET(fetchOptions);
```

Note that it does not allow you to attach middlewares. If you need middlewares, you need to use the full form:

```ts
const client = createClient<paths>(clientOptions);

client.use(authMiddleware);

const pathBasedClient = wrapAsPathBasedClient(client);

client.use(loggingMiddleware); // the client reference is shared, so the middlewares will propagate.

pathBasedClient["/my-url"].GET(fetchOptions);
```

## querySerializer

OpenAPI supports [different ways of serializing objects and arrays](https://swagger.io/docs/specification/serialization/#query-parameters) for parameters (strings, numbers, and booleans—primitives—always behave the same way). By default, this library serializes arrays using `style: "form", explode: true`, and objects using `style: "deepObject", explode: true`, but you can customize that behavior with the `querySerializer` option (either on `createClient()` to control every request, or on individual requests for just one).

### Object syntax

openapi-typesafe-fetch ships the common serialization methods out-of-the-box:

| Option          |       Type        | Description                                                                                                                                                    |
| :-------------- | :---------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `array`         | SerializerOptions | Set `style` and `explode` for arrays ([docs](https://swagger.io/docs/specification/serialization/#query-parameters)). Default: `{ style: "form", explode: true }`; each one left out takes its default. |
| `object`        | SerializerOptions | Set `style` and `explode` for objects ([docs](https://swagger.io/docs/specification/serialization/#query-parameters)). Default: `{ style: "deepObject", explode: true }`; each one left out takes its default. |
| `allowReserved` |     `boolean`     | Set to `true` to skip URL encoding of values (may break the request) ([docs](https://swagger.io/docs/specification/serialization/#query-parameters)). Default: `false`. |

```ts
const client = createClient<paths>({
  querySerializer: {
    array: {
      style: "pipeDelimited", // "form" (default) | "spaceDelimited" | "pipeDelimited"
      explode: true,
    },
    object: {
      style: "form", // "form" | "deepObject" (default)
      explode: true,
    },
  },
});
```

A `Date` value is sent as ISO 8601 in UTC (`2026-11-08T12:30:00.000Z`, from `toISOString()`), on
its own, in an array or in an object, and in path parameters too; an invalid `Date` throws a
`RangeError`. A parameter that serializes to nothing (`null`, `undefined`, an empty array or an
empty object) is left out together with its `&`, and so are the `null` and `undefined` items and
members of exploded arrays and objects.

Parameter names and object keys are encoded too, so a key from your data (`{ "a&b": 1 }`) cannot
add a parameter or a path segment. In parameter names, `[`, `]`, `$`, `:`, `@` and `,` stay as
written, so names such as `filter[status]` and `$filter` are sent unchanged. Object keys are
encoded as values are, with no exceptions: `{ "a,b": 1 }` is `a%2Cb,1` and `{ "a]": 1 }` in a
`deepObject` is `filter[a%5D]=1`, so a key cannot add members for a server that splits the text
first. A server that decodes the text before it splits it (for example `qs`, the default query
parser of Express, which reads `filter[a%5D%5Bb]` as `filter[a][b]`) still cannot tell such a key
apart: validate keys that come from end users, or use a style where they are plain values.

#### Array styles

| Style                        | Array `id = [3, 4, 5]`  |
| :--------------------------- | :---------------------- |
| form                         | `/users?id=3,4,5`       |
| **form (exploded, default)** | `/users?id=3&id=4&id=5` |
| spaceDelimited               | `/users?id=3%204%205`   |
| spaceDelimited (exploded)    | `/users?id=3&id=4&id=5` |
| pipeDelimited                | `/users?id=3\|4\|5`     |
| pipeDelimited (exploded)     | `/users?id=3&id=4&id=5` |

#### Object styles

| Style                    | Object `id = {"role": "admin", "firstName": "Alex"}` |
| :----------------------- | :--------------------------------------------------- |
| form                     | `/users?id=role,admin,firstName,Alex`                |
| form (exploded)          | `/users?role=admin&firstName=Alex`                   |
| **deepObject (default)** | `/users?id[role]=admin&id[firstName]=Alex`           |

::: tip

**deepObject** is always exploded, so it doesn’t matter if you set `explode: true` or `explode: false`—it’ll generate the same output.

:::

### Alternate function syntax

Sometimes your backend doesn’t use one of the standard serialization methods, in which case you can pass a function to `querySerializer` to serialize the entire string yourself. You’ll also need to use this if you’re handling deeply-nested objects and arrays in your params:

```ts
const client = createClient<paths>({
  querySerializer(queryParams) {
    const search: string[] = [];
    for (const name in queryParams) {
      const value = queryParams[name];
      if (Array.isArray(value)) {
        for (const item of value) {
          search.push(`${name}[]=${encodeURIComponent(String(item))}`);
        }
      } else {
        search.push(`${name}=${encodeURIComponent(String(value))}`);
      }
    }
    return search.join("&"); // ?tags[]=food&tags[]=california&tags[]=healthy
  },
});
```

::: warning

When serializing yourself, the string will be kept exactly as-authored, so you’ll have to call [encodeURI](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI) or [encodeURIComponent](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent) to escape special characters.

:::

## bodySerializer

Similar to [querySerializer](#queryserializer), bodySerializer allows you to customize how the requestBody is serialized if you don’t want the default [JSON.stringify()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) behavior.

A `multipart/form-data` body needs no serializer: set the header and pass the object. Each field
becomes a part (a `Blob` or `File` a file part, a `Date` its ISO 8601 text, an array one part per
item, `null` and `undefined` left out), and the platform sets the boundary. Generate the types with
[`--binary-as-blob`](/cli#binaryasblob) so file fields are typed `Blob`.

```ts
const { data, error } = await client.POST("/avatars", {
  headers: { "Content-Type": "multipart/form-data" },
  body: { file: new File([bytes], "avatar.png"), description: "Me" },
});
```

A nested object or array (an object item, or an array in an array) in such a body throws, because a
part with JSON needs its own content type and servers differ. For that, or any other format, write a `bodySerializer`:

```ts
const { data, error } = await client.PUT("/submit", {
  body: {
    name: "",
    query: { version: 2 },
  },
  bodySerializer(body) {
    const fd = new FormData();
    // `body` can be `undefined` when the schema's request body is optional (the default)
    if (body) {
      fd.append("name", body.name);
      // the nested object becomes a JSON part with its own content type
      fd.append("query", new Blob([JSON.stringify(body.query)], { type: "application/json" }));
    }
    return fd;
  },
});
```

::: tip

For convenience, `openapi-typesafe-fetch` sets `Content-Type` to `application/json` automatically
for any request that provides value for the `body` parameter. When the body (or the `bodySerializer` result) is a
`FormData`, `Blob`, `File`, `URLSearchParams`, `ArrayBuffer`, typed array or stream, `Content-Type` is omitted, allowing the
platform to set it automatically (for `FormData`, with the correct message part boundary). For the
same reason a `multipart/form-data` `Content-Type` that you set is dropped when the client builds
the `FormData` from an object, `boundary` or not: the platform picks the boundary of the body. This
holds for a `bodySerializer` of yours that returns the result of `defaultBodySerializer` too. For a
`FormData` that you build yourself, a `Content-Type` without a `boundary` is dropped, and one with a
`boundary` is kept for a `fetch` of your own that writes the parts with it.

You can also set `Content-Type` manually through `headers` object either in the fetch options,
or when instantiating the client.

:::

### Text body

A string body is sent as is when you set a non-JSON `Content-Type`, such as `text/plain`. Without a
`Content-Type`, or with a JSON one, a string is sent as a JSON string value (`"abc"` becomes `"\"abc\""`).
A JSON media type is `application/json` or one with a `+json` suffix (`application/problem+json`),
with or without parameters (RFC 6838). Line-based formats such as `application/x-ndjson`,
`application/jsonl` and `application/json-seq` are not: a string body is their text, sent as is.

```ts
const { data, error } = await client.POST("/notes", {
  body: "Remember the milk",
  headers: { "Content-Type": "text/plain" },
});
```

### Binary body

A `Blob`, `File`, `ArrayBuffer`, typed array or `ReadableStream` (the usual types for a `format: binary`
schema) is sent as is. Set `Content-Type` yourself when the server needs one; a `Blob` with a `type` gets it
from the platform. A `ReadableStream` is streamed: the client sets `duplex: "half"`, which the Fetch
standard requires for a stream body. Node.js, Deno and Bun send it; browser support for stream
request bodies varies (Chromium needs HTTP/2), so in a browser send a `Blob` unless you checked yours.
An async iterable, such as a Node.js `Readable` (`fs.createReadStream()`), is streamed the same way:
Node.js, Deno and Bun accept it as a body (Deno only with `Uint8Array` chunks). Browsers do not, so
there wrap it in a `ReadableStream`.

```ts
const { data, error } = await client.PUT("/files/{name}", {
  params: { path: { name: "photo.png" } },
  body: file,
  headers: { "Content-Type": "image/png" },
});
```

### URL-encoded body

To send a body request in `application/x-www-form-urlencoded` format, which is commonly used to transmit key-value pairs in APIs like OAuth 2.0, pass the appropriate header (parameters such as `; charset=UTF-8` may follow) and body as an object. `openapi-typesafe-fetch` will automatically encode the body to the correct format.

```ts
const { data, error } = await client.POST("/tokens", {
  body: {
    clientId: "someClientId",
    clientSecret: "someClientSecret",
  },
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
});
```

Form encoding has no standard for nested objects (servers read `a[b]`, `a.b` or JSON), so a nested
object value, an object in an array, or an array in an array throws an error instead of being sent
as `[object Object]` or flattened. An array becomes one
comma-separated value (`ids=1%2C2`), a `Date` its ISO 8601 text as in parameters, and a `null` or
`undefined` field is left out, as in a multipart body. For nested values or repeated keys, write a `bodySerializer` in the format your server reads.

## pathSerializer

Similar to [querySerializer](#queryserializer) and [bodySerializer](#bodyserializer), `pathSerializer` allows you to customize how path parameters are serialized. This is useful when your API uses a non-standard path serialization format, or you want to change the default behavior.

### Custom Path Serializer

You can provide a custom path serializer when creating the client:

```ts
const client = createClient<paths>({
  pathSerializer(pathname, pathParams) {
    let result = pathname;
    for (const [key, value] of Object.entries(pathParams)) {
      result = result.replace(`{${key}}`, `[${value}]`);
    }
    return result;
  },
});

const { data, error } = await client.GET("/users/{id}", {
  params: { path: { id: 5 } },
});

// URL: `/users/[5]`
```

::: warning

The default path serializer rejects a request when a path parameter makes a `.` or `..` path segment (for
example `{ id: ".." }`): URL resolution would send it to another endpoint. This holds for a path with a
query string or fragment in its template too (`/echo/{id}?v=2`); the query and fragment themselves are not
checked. It also rejects a path that starts with `//` once the parameters are in (an empty first
parameter, as in `/{org}/{repo}` with `org: ""`): with a relative `baseUrl` (the default `""`) a browser
reads `//evil.example` as another host and sends the request, headers included, there. An empty value in a
later segment (`/acme/`) is sent as before. Only what the parameters write is checked: the `baseUrl` and the
template text before the first parameter are not, so a protocol-relative `baseUrl` such as
`//api.example.com/v1` works. A custom `pathSerializer` is not checked. The error names the segment
of the template that made the bad segment (`Dot path segment in "{id}"`),
never the URL or a value, which can carry a token or credentials.

:::

### Default Path Serializer

openapi-typesafe-fetch supports path serialization as [outlined in the 3.1 spec](https://swagger.io/docs/specification/serialization/#path-parameters). This happens automatically, based on the specific format in your OpenAPI schema:

| Template          | Style                | Primitive `id = 5` | Array `id = [3, 4, 5]`   | Object `id = {"role": "admin", "firstName": "Alex"}` |
| :---------------- | :------------------- | :----------------- | :----------------------- | :--------------------------------------------------- |
| **`/users/{id}`** | **simple (default)** | **`/users/5`**     | **`/users/3,4,5`**       | **`/users/role,admin,firstName,Alex`**               |
| `/users/{id*}`    | simple (exploded)    | `/users/5`         | `/users/3,4,5`           | `/users/role=admin,firstName=Alex`                   |
| `/users/{.id}`    | label                | `/users/.5`        | `/users/.3,4,5`          | `/users/.role,admin,firstName,Alex`                  |
| `/users/{.id*}`   | label (exploded)     | `/users/.5`        | `/users/.3.4.5`          | `/users/.role=admin.firstName=Alex`                  |
| `/users/{;id}`    | matrix               | `/users/;id=5`     | `/users/;id=3,4,5`       | `/users/;id=role,admin,firstName,Alex`               |
| `/users/{;id*}`   | matrix (exploded)    | `/users/;id=5`     | `/users/;id=3;id=4;id=5` | `/users/;role=admin;firstName=Alex`                  |

## Middleware

Middleware is an object with `onRequest()`, `onResponse()` and `onError()` callbacks that can observe and modify requests, responses and errors.

```ts
import createClient, { type Middleware } from "openapi-typesafe-fetch";
import type { paths } from "./my-openapi-3-schema"; // generated by openapi-typesafe

const myMiddleware: Middleware = {
  async onRequest({ request, options }) {
    // set "foo" header
    request.headers.set("foo", "bar");
    return request;
  },
  async onResponse({ request, response, options }) {
    // change status of response; Response fields are getters, so copy them by name
    return new Response(response.body, {
      status: 200,
      statusText: response.statusText,
      headers: response.headers,
    });
  },
  async onError({ error }) {
    // wrap errors thrown by fetch
    return new Error("Oops, fetch failed", { cause: error });
  },
};

const client = createClient<paths>({ baseUrl: "https://myapi.dev/v1/" });

// register middleware
client.use(myMiddleware);
```

### API

#### Parameters

Each middleware callback receives the following `options` object with the following:

| Name         | Type            | Description                                                      |
| :----------- | :-------------- | :----------------------------------------------------------------|
| `request`    | `Request`       | The current `Request` to be sent to the endpoint.                |
| `schemaPath` | `string`        | The original OpenAPI path called (e.g. `/users/{user_id}`)       |
| `params`     | `Object`        | The original `params` object passed to `GET()` / `POST()` / etc. |
| `id`         | `string`        | A unique ID for this request: a counter, shared by all clients in the process. |
| `options`    | `MergedOptions` | The options of this request after merging the client and request options (read-only): `baseUrl`, `fetch`, `parseAs`, `querySerializer`, `bodySerializer` and `pathSerializer`. |

In addition to these, the `onResponse` callback receives an additional `response` property:

| Name         | Type            | Description                                |
| :----------- | :-------------- | :------------------------------------------|
| `response`   | `Response`      | The `Response` returned from the endpoint. |

And the `onError` callback receives an additional `error` property:

| Name         | Type            | Description                                                              |
| :----------- | :-------------- | :------------------------------------------------------------------------|
| `error`      | `unknown`       | The error thrown by `fetch`, probably a `TypeError` or a `DOMException`. |

#### Response

Each middleware callback can return:

- **onRequest**: A `Request` to modify the request, a `Response` to short-circuit the middleware chain, or `undefined` to leave request untouched (skip)
- **onResponse**: Either a `Response` to modify the response, or `undefined` to leave it untouched (skip)
- **onError**: Either an `Error` (of any realm) to modify the error that is thrown, a `Response` which means that the `fetch` call will proceed as successful, or `undefined` to leave the error untouched (skip)

A `Request` is recognized by its `method`, `url` and `headers`, a `Response` by its `ok`, `status`,
`headers` and `text()`, not by its class. So one from the `undici` package, from another realm (an
iframe, an Electron host) or of a custom `Request` class works too. A plain copy such as
`{ ...request }`, or a test double without `ok`, lacks them and throws, instead of being read as an
error response.

### Ejecting middleware

To remove middleware, call `client.eject(middleware)`:

```ts{11}
import type { Middleware } from "openapi-typesafe-fetch";

const myMiddleware: Middleware = {
  onRequest({ request }) {
    // …
  },
};

// register middleware
client.use(myMiddleware);

// remove middleware
client.eject(myMiddleware);
```

For additional guides & examples, see [Middleware & Auth](/fetch/middleware-auth)

## Other exports

The package also exports the helpers the client is built from. They follow semantic versioning
like the rest of the API.

| Name | Description |
| :--- | :---------- |
| `defaultBodySerializer(body, headers?)` | The default [bodySerializer](#bodyserializer). See below for its result type. |
| `defaultPathSerializer(pathname, pathParams)` | The default [pathSerializer](#default-path-serializer). |
| `createQuerySerializer(options?)` | Builds the default [querySerializer](#queryserializer) from its object options. |
| `serializePrimitiveParam`, `serializeObjectParam`, `serializeArrayParam` | Serialize one parameter with an OpenAPI `style` and `explode`. |
| `createFinalURL(pathname, options)` | Builds the request URL from `baseUrl`, the path and the query parameters. |
| `mergeHeaders(...headers)` | Merges header sets into one `Headers`; later ones win, and `null` removes a header. |
| `removeTrailingSlash(url)` | Removes one trailing `/`. |
| `randomID()` | Returns a new ID, unique within the process: the `id` that middleware callbacks get. The name is openapi-fetch's; the ID comes from a counter, not from `Math.random()`. |
| `ClientPathsWithMethod<Client, Method>`, `MethodResponse<Client, Method, Path>` | Types: the paths of a client that have a method, and the `data` type of one call. |
| The helper types (`PathsWithMethod`, `FilterKeys`, `SuccessResponse`, …) | Declared by the client in its `openapi-typesafe-fetch/helpers` entry; import them from `openapi-typesafe-helpers`, which re-exports them. The main entry does not export them, as openapi-fetch's does not. The names of both packages are one declaration, so they mix, also in generic code. Types inferred from the client name them through `openapi-typesafe-fetch/helpers`, so a library built with `declaration: true` under pnpm or Yarn PnP gets declarations that name a package it depends on. A library under Yarn PnP that depends only on `openapi-typesafe-helpers` and exports an inferred type that prints a helper type gets `import("openapi-typesafe-fetch/helpers")`, which its users cannot resolve (TS2307): add `openapi-typesafe-fetch` to its dependencies, or annotate the type. |

`defaultBodySerializer` returns by the body type:

- A raw body (`FormData`, `Blob`, `URLSearchParams`, `ArrayBuffer`, a typed array) is returned as it is.
- `undefined` gives `undefined`.
- An object gives `string` (JSON, or URL-encoded form data with a form `Content-Type`). With a
  `multipart/form-data` `Content-Type` in headers written as a record literal it gives `FormData`;
  with headers of another form (`Headers`, pairs, a `string`-typed value) the type is
  `string | FormData`.
- Any other value gives `string`.
