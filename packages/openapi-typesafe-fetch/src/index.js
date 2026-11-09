// settings & const
const PATH_PARAM_RE = /\{[^{}]+\}/g;
/**
 * A `.` or `..` path segment; URLs resolve it, so a parameter value could leave its path (#2483).
 */
const DOT_SEGMENT_RE = /^\.\.?$/;
/** Where the path of a URL ends: its query or fragment, which have no segments. */
const QUERY_OR_FRAGMENT_RE = /[?#]/;
/**
 * A JSON media type: `json` or a `+json` suffix (RFC 6838), as in `application/problem+json`, with
 * or without parameters. Not `x-ndjson`, `jsonl` or `json-seq`: their bodies are lines of JSON.
 */
const JSON_MEDIA_TYPE_RE = /^[^/]+\/([^;]*\+)?json\s*(;|$)/i;
/** `text/*` media types: a JSON parse error of such a body points to `parseAs: "text"`. */
const TEXT_MEDIA_TYPE_RE = /^text\//i;
/** `application/x-www-form-urlencoded`, with or without parameters such as `charset`. */
const FORM_MEDIA_TYPE_RE = /^application\/x-www-form-urlencoded(;|$)/i;
/** `multipart/form-data`, with or without parameters. */
const MULTIPART_MEDIA_TYPE_RE = /^multipart\/form-data(;|$)/i;
const NESTED_FORM_VALUE_MESSAGE = "Nested form values need your own `bodySerializer()`.";
/** The `boundary` parameter of a multipart `Content-Type`; only the platform knows its value. */
const BOUNDARY_PARAMETER_RE = /;\s*boundary=/i;

/**
 * Marks the FormData objects the default `bodySerializer` built. Only for them is the boundary the
 * platform's alone, whoever returns them (a `bodySerializer` may wrap the default one). A
 * registered symbol is the same in the CommonJS and ES module builds and in every copy of the
 * package, so a form one of them built is known to the others (ADR-013, decision 10).
 */
const CLIENT_BUILT_FORM = Symbol.for("openapi-typesafe-fetch/form");

/** `[object Name]`: the type tag is between these indexes of `Object.prototype.toString`. */
const TYPE_TAG_START = "[object ".length;
const TYPE_TAG_END = -1;
const BLOB_TAGS = new Set(["Blob", "File"]);
/** Raw bodies told by their type tag alone: they have no methods the client uses. */
const RAW_BODY_TAGS = new Set(["URLSearchParams", "ArrayBuffer"]);

/**
 * Whether `fetch` is Node.js undici, which takes `requestInitExt` as a second argument. A Node.js
 * version check is not needed: every supported Node.js (`engines`) ships undici.
 */
const supportsRequestInitExt = () => {
  return typeof process === "object" && process.versions?.undici;
};

/**
 * The number of request ids handed out. It is shared by all clients on purpose: one middleware can
 * be used by several clients, and it tells their requests apart by id.
 */
let requestIdCount = 0;

/**
 * Returns a cheap, non-cryptographically-secure ID, unique within the process.
 * A counter, not `Math.random()`: Next.js prerendering rejects random values read before uncached
 * data (upstream #2486, #2763). The name stays for compatibility.
 */
export function randomID() {
  requestIdCount += 1;
  return requestIdCount.toString(36);
}

/**
 * Create an openapi-typesafe-fetch client.
 * @type {import("./index.js").default}
 */
// biome-ignore lint/complexity/noExcessiveLinesPerFunction: inherited, kept until 1.1 (ADR-036)
export default function createClient(clientOptions) {
  let {
    baseUrl = "",
    Request: CustomRequest = globalThis.Request,
    FormData: CustomFormData = globalThis.FormData,
    fetch: baseFetch = globalThis.fetch,
    querySerializer: globalQuerySerializer,
    bodySerializer: globalBodySerializer,
    pathSerializer: globalPathSerializer,
    headers: baseHeaders,
    requestInitExt = undefined,
    ...baseOptions
  } = { ...clientOptions };
  requestInitExt = supportsRequestInitExt() ? requestInitExt : undefined;
  baseUrl = removeTrailingSlash(baseUrl);
  const globalMiddlewares = [];

  /**
   * Per-request fetch (keeps settings created in createClient()
   * @param {T} url
   * @param {import('./index.js').FetchOptions<T>} fetchOptions
   */
  // biome-ignore lint/complexity/noExcessiveLinesPerFunction: inherited, kept until 1.1 (ADR-036)
  async function coreFetch(schemaPath, fetchOptions) {
    const {
      baseUrl: localBaseUrl,
      fetch = baseFetch,
      Request = CustomRequest,
      headers,
      params = {},
      parseAs = "json",
      querySerializer: requestQuerySerializer,
      bodySerializer = globalBodySerializer ?? defaultBodySerializer,
      pathSerializer: requestPathSerializer,
      body,
      middleware: requestMiddlewares = [],
      ...init
    } = fetchOptions || {};
    let finalBaseUrl = baseUrl;
    if (localBaseUrl) {
      finalBaseUrl = removeTrailingSlash(localBaseUrl) ?? baseUrl;
    }

    let querySerializer =
      typeof globalQuerySerializer === "function"
        ? globalQuerySerializer
        : createQuerySerializer(globalQuerySerializer);
    if (requestQuerySerializer) {
      querySerializer =
        typeof requestQuerySerializer === "function"
          ? requestQuerySerializer
          : createQuerySerializer({
              ...(typeof globalQuerySerializer === "object" ? globalQuerySerializer : {}),
              ...requestQuerySerializer,
            });
    }

    const pathSerializer = requestPathSerializer || globalPathSerializer || defaultPathSerializer;

    const serializedBody =
      body === undefined
        ? undefined
        : bodySerializer(
            body,
            // Note: we declare mergeHeaders() both here and below because it’s a bit of a
            // chicken-or-egg situation: bodySerializer() needs all headers so we aren’t dropping
            // ones set by the user, however, the result of this ALSO sets the lowest-priority
            // content-type header. So we re-merge below, setting the content-type at the very
            // beginning to be overwritten. Lastly, based on the way headers work, it’s not a simple
            // “present-or-not” check because null intentionally un-sets headers.
            mergeHeaders(baseHeaders, headers, params.header),
          );
    const requestBody = isFormData(serializedBody)
      ? asFormDataOf(CustomFormData, serializedBody)
      : serializedBody;
    const finalHeaders = mergeHeaders(
      // with no body, we should not to set Content-Type
      requestBody === undefined ||
        // a raw body (FormData, Blob, ...) gets its Content-Type from the platform, or none
        isRawBody(requestBody)
        ? {}
        : {
            "Content-Type": "application/json",
          },
      baseHeaders,
      headers,
      params.header,
    );
    if (isFormData(requestBody)) {
      dropFormContentType(finalHeaders, requestBody[CLIENT_BUILT_FORM] === true);
    }

    // Client level middleware take priority over request-level middleware
    const finalMiddlewares = [...globalMiddlewares, ...requestMiddlewares];

    const requestInit = {
      redirect: "follow",
      // The Fetch standard requires `duplex: "half"` (its only value) for a stream body.
      duplex: isStreamBody(requestBody) ? "half" : undefined,
      ...baseOptions,
      ...init,
      body: requestBody,
      headers: finalHeaders,
    };

    let id;
    let options;
    let request = new Request(
      createFinalURL(schemaPath, {
        baseUrl: finalBaseUrl,
        params,
        querySerializer,
        pathSerializer,
      }),
      requestInit,
    );
    let response;

    /** Add custom parameters to Request object */
    for (const key in init) {
      if (!(key in request)) {
        request[key] = init[key];
      }
    }

    if (finalMiddlewares.length) {
      id = randomID();

      // middleware (request)
      options = Object.freeze({
        baseUrl: finalBaseUrl,
        fetch,
        parseAs,
        querySerializer,
        bodySerializer,
        pathSerializer,
      });
      for (const m of finalMiddlewares) {
        if (m && typeof m === "object" && typeof m.onRequest === "function") {
          const result = await m.onRequest({
            request,
            schemaPath,
            params,
            options,
            id,
          });
          if (result) {
            if (isRequest(result)) {
              request = result;
            } else if (isResponse(result)) {
              response = result;
              break;
            } else {
              throw new Error(
                "onRequest: must return new Request() or Response() when modifying the request",
              );
            }
          }
        }
      }
    }

    if (!response) {
      // fetch!
      try {
        response = await fetch(request, requestInitExt);
      } catch (error) {
        let errorAfterMiddleware = error;
        // middleware (error)
        // execute in reverse-array order (first priority gets last transform)
        if (finalMiddlewares.length) {
          for (let i = finalMiddlewares.length - 1; i >= 0; i--) {
            const m = finalMiddlewares[i];
            if (m && typeof m === "object" && typeof m.onError === "function") {
              const result = await m.onError({
                request,
                error: errorAfterMiddleware,
                schemaPath,
                params,
                options,
                id,
              });
              if (result) {
                // if error is handled by returning a response, skip remaining middleware
                if (isResponse(result)) {
                  errorAfterMiddleware = undefined;
                  response = result;
                  break;
                }

                if (result instanceof Error) {
                  errorAfterMiddleware = result;
                  continue;
                }

                throw new Error("onError: must return new Response() or instance of Error");
              }
            }
          }
        }

        // rethrow error if not handled by middleware
        if (errorAfterMiddleware) {
          throw errorAfterMiddleware;
        }
      }
      // A lookalike from the `fetch` option is rejected as one from middleware is (ADR-025).
      if (!isResponse(response)) {
        throw new Error("fetch: must return new Response()");
      }

      // middleware (response)
      // execute in reverse-array order (first priority gets last transform)
      if (finalMiddlewares.length) {
        for (let i = finalMiddlewares.length - 1; i >= 0; i--) {
          const m = finalMiddlewares[i];
          if (m && typeof m === "object" && typeof m.onResponse === "function") {
            const result = await m.onResponse({
              request,
              response,
              schemaPath,
              params,
              options,
              id,
            });
            if (result) {
              if (!isResponse(result)) {
                throw new Error(
                  "onResponse: must return new Response() when modifying the response",
                );
              }
              response = result;
            }
          }
        }
      }
    }

    return readResult(response, parseAs);
  }

  return {
    baseUrl,
    request(method, url, init) {
      return coreFetch(url, { ...init, method: method.toUpperCase() });
    },
    /** Call a GET endpoint */
    GET(url, init) {
      return coreFetch(url, { ...init, method: "GET" });
    },
    /** Call a PUT endpoint */
    PUT(url, init) {
      return coreFetch(url, { ...init, method: "PUT" });
    },
    /** Call a POST endpoint */
    POST(url, init) {
      return coreFetch(url, { ...init, method: "POST" });
    },
    /** Call a DELETE endpoint */
    DELETE(url, init) {
      return coreFetch(url, { ...init, method: "DELETE" });
    },
    /** Call a OPTIONS endpoint */
    OPTIONS(url, init) {
      return coreFetch(url, { ...init, method: "OPTIONS" });
    },
    /** Call a HEAD endpoint */
    HEAD(url, init) {
      return coreFetch(url, { ...init, method: "HEAD" });
    },
    /** Call a PATCH endpoint */
    PATCH(url, init) {
      return coreFetch(url, { ...init, method: "PATCH" });
    },
    /** Call a TRACE endpoint */
    TRACE(url, init) {
      return coreFetch(url, { ...init, method: "TRACE" });
    },
    /** Call a QUERY endpoint (OpenAPI 3.2) */
    QUERY(url, init) {
      return coreFetch(url, { ...init, method: "QUERY" });
    },
    /** Register middleware */
    use(...middleware) {
      for (const m of middleware) {
        if (!m) {
          continue;
        }
        if (typeof m !== "object" || !("onRequest" in m || "onResponse" in m || "onError" in m)) {
          throw new Error(
            "Middleware must be an object with one of `onRequest()`, `onResponse()` or `onError()`",
          );
        }
        globalMiddlewares.push(m);
      }
    },
    /** Unregister middleware */
    eject(...middleware) {
      for (const m of middleware) {
        const i = globalMiddlewares.indexOf(m);
        if (i !== -1) {
          globalMiddlewares.splice(i, 1);
        }
      }
    },
  };
}

class PathCallForwarder {
  constructor(client, url) {
    this.client = client;
    this.url = url;
  }

  GET = (init) => {
    return this.client.GET(this.url, init);
  };
  PUT = (init) => {
    return this.client.PUT(this.url, init);
  };
  POST = (init) => {
    return this.client.POST(this.url, init);
  };
  DELETE = (init) => {
    return this.client.DELETE(this.url, init);
  };
  OPTIONS = (init) => {
    return this.client.OPTIONS(this.url, init);
  };
  HEAD = (init) => {
    return this.client.HEAD(this.url, init);
  };
  PATCH = (init) => {
    return this.client.PATCH(this.url, init);
  };
  TRACE = (init) => {
    return this.client.TRACE(this.url, init);
  };
  QUERY = (init) => {
    return this.client.QUERY(this.url, init);
  };
}

class PathClientProxyHandler {
  constructor() {
    this.client = null;
  }

  // Assume the property is an URL.
  get(coreClient, url) {
    const forwarder = new PathCallForwarder(coreClient, url);
    this.client[url] = forwarder;
    return forwarder;
  }
}

/**
 * Wrap openapi-typesafe-fetch client to support a path based API.
 * @type {import("./index.js").wrapAsPathBasedClient}
 */
export function wrapAsPathBasedClient(coreClient) {
  const handler = new PathClientProxyHandler();
  const proxy = new Proxy(coreClient, handler);

  // Put the proxy on the prototype chain of the actual client.
  // This means if we do not have a memoized PathCallForwarder,
  // we fall back to the proxy to synthesize it.
  // However, the proxy itself is not on the hot-path (if we fetch the same
  // endpoint multiple times, only the first call will hit the proxy).
  function Client() {}
  Client.prototype = proxy;

  const client = new Client();

  // Feed the client back to the proxy handler so it can store the generated
  // PathCallForwarder.
  handler.client = client;

  return client;
}

/**
 * Convenience method to an openapi-typesafe-fetch path based client.
 * Strictly equivalent to `wrapAsPathBasedClient(createClient(...))`.
 * @type {import("./index.js").createPathBasedClient}
 */
export function createPathBasedClient(clientOptions) {
  return wrapAsPathBasedClient(createClient(clientOptions));
}

// utils

/**
 * `fetch` sends a FormData as multipart with a boundary only it knows, so a `Content-Type` set by
 * hand replaced the platform's and the server could not split the parts (upstream #1214). It goes,
 * and the platform sets its own, unless the user built the FormData and named a boundary for a
 * `fetch` of their own (ADR-013, decision 10).
 */
function dropFormContentType(headers, isClientBuilt) {
  if (isClientBuilt || !BOUNDARY_PARAMETER_RE.test(headers.get("Content-Type"))) {
    headers.delete("Content-Type");
  }
}

// Fetch API objects are recognized by the members the client uses, not by `instanceof`: that is
// bound to one realm's class, and a Request from the `undici` package, another realm (an iframe,
// an Electron host) or a custom `Request` option is not an instance of it (upstream #1847). The
// same rule as for headers in `defaultBodySerializer` (upstream #2637).

function isHeaders(value) {
  return typeof value?.get === "function";
}

function isRequest(value) {
  return (
    typeof value?.method === "string" && typeof value.url === "string" && isHeaders(value.headers)
  );
}

function isResponse(value) {
  return (
    typeof value?.ok === "boolean" &&
    typeof value.status === "number" &&
    typeof value.text === "function" &&
    isHeaders(value.headers)
  );
}

/**
 * Parse a JSON body. A body that is not JSON, such as the HTML page of a proxy, threw a bare
 * `SyntaxError`; this one names the response and says which `parseAs` reads it (ADR-041). It holds
 * no body text, and so no `cause`: the parser's message quotes the body, and a body such as a
 * form-encoded OAuth token answer would carry a secret into logs and error trackers.
 */
function parseJSON(raw, response) {
  try {
    return JSON.parse(raw);
  } catch {
    const contentType = response.headers.get("Content-Type");
    const hint = TEXT_MEDIA_TYPE_RE.test(contentType) ? 'set `parseAs: "text"`' : "set `parseAs`";
    const subject = `Response ${response.status} (${contentType ?? "no Content-Type"})`;
    throw new SyntaxError(`${subject} is not JSON (${raw.length} characters); ${hint}`);
  }
}

/**
 * Whether the headers say the body is empty: a `Content-Length` of 0 without chunked transfer.
 * A 204 and an answer to HEAD have an empty body anyway.
 */
function hasDeclaredEmptyBody(response) {
  return (
    response.headers.get("Content-Length") === "0" &&
    !response.headers.get("Transfer-Encoding")?.includes("chunked")
  );
}

/**
 * The `data` or `error` of a response. An empty body is no data for JSON and no error, but each
 * other `parseAs` reads the body with its method, also an empty one: `""`, an empty Blob or
 * ArrayBuffer, or `response.body`, as their types say.
 */
async function readResult(response, parseAs) {
  if (!response.ok) {
    return { error: await readErrorBody(response), response };
  }
  if (parseAs === "json" && hasDeclaredEmptyBody(response)) {
    return { data: undefined, response };
  }
  return { data: await readSuccessBody(response, parseAs), response };
}

/** The data of a success response, by `parseAs` (default `"json"`, as in openapi-fetch). */
async function readSuccessBody(response, parseAs) {
  if (parseAs === "stream") {
    return response.body;
  }
  if (parseAs !== "json") {
    return response[parseAs]();
  }
  // text(), not json(): an empty body (no Content-Length) is no data, and the text names a failure.
  const raw = await response.text();
  return raw ? parseJSON(raw, response) : undefined;
}

/**
 * The error of an error response: `undefined` for an empty body, else JSON. A body that is not
 * JSON (a proxy's HTML page) stays text, as in openapi-fetch.
 */
async function readErrorBody(response) {
  const raw = await response.text();
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Deliberate fallback, not a lost failure: the caller gets the body as text in `error`.
    return raw;
  }
}

// Parameter names can be data (the keys of a free-form query). They are encoded like values,
// except for characters common in the names a schema declares (`filter[status]`, `$filter`) that
// do not split a URL (ADR-013, decision 9). Object keys are always data, so they are encoded as
// values are, with no exceptions: a `,` or `]` in a key added members for the server.
const KEPT_NAME_ESCAPES = /%(?:5B|5D|24|3A|40|2C)/g;

function encodeName(name) {
  return encodeURIComponent(name).replace(KEPT_NAME_ESCAPES, decodeURIComponent);
}

/**
 * A `Date` value. Checked by its method, not with `instanceof`, so a Date from another realm counts
 * too (as for the Fetch API objects above).
 */
function isDate(value) {
  return typeof value?.toISOString === "function";
}

/**
 * A parameter or form value as it is sent: a `Date` as ISO 8601, because `String(date)` is a
 * local-time text such as "Thu Jan 01 1970 ..." (ADR-041); any other value as it is.
 */
function valueText(value) {
  return isDate(value) ? value.toISOString() : value;
}

/** One parameter value (or object key), percent-encoded unless `allowReserved`. */
function encodeValue(value, allowReserved) {
  const text = valueText(value);
  return allowReserved === true ? text : encodeURIComponent(text);
}

/**
 * Serialize primitive param values
 * @type {import("./index.js").serializePrimitiveParam}
 */
export function serializePrimitiveParam(name, value, options) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "object" && !isDate(value)) {
    throw new Error(
      "Deeply-nested arrays/objects aren’t supported. Provide your own `querySerializer()` to handle these.",
    );
  }
  return `${name}=${encodeValue(value, options?.allowReserved)}`;
}

/** Join exploded parts: by `,`, `.` or `;` in a path style (label and matrix also first), else `&`. */
function joinExploded(values, style) {
  const joiner = { simple: ",", label: ".", matrix: ";" }[style] || "&";
  const final = values.join(joiner);
  return style === "label" || style === "matrix" ? `${joiner}${final}` : final;
}

/** A non-exploded object: names and values in one comma-separated list. */
function serializeUnexplodedObject(name, value, options) {
  const values = [];
  for (const k in value) {
    values.push(encodeValue(k), encodeValue(value[k], options.allowReserved));
  }
  const final = values.join(",");
  switch (options.style) {
    case "form": {
      return `${name}=${final}`;
    }
    case "label": {
      return `.${final}`;
    }
    case "matrix": {
      return `;${name}=${final}`;
    }
    default: {
      return final;
    }
  }
}

/**
 * Serialize object param (shallow only). An object without members, or with only `null` and
 * `undefined` ones when exploded, gives `""`: its empty parts added stray separators (ADR-041).
 * @type {import("./index.js").serializeObjectParam}
 */
export function serializeObjectParam(name, value, options) {
  if (!value || typeof value !== "object" || !Object.keys(value).length) {
    return "";
  }
  if (options.style !== "deepObject" && options.explode === false) {
    return serializeUnexplodedObject(name, value, options);
  }
  const values = [];
  for (const k in value) {
    const key = encodeValue(k);
    const finalName = options.style === "deepObject" ? `${name}[${key}]` : key;
    if (value[k] != null) {
      values.push(serializePrimitiveParam(finalName, value[k], options));
    }
  }
  return values.length ? joinExploded(values, options.style) : "";
}

/** A non-exploded array; the item separator depends on the style. */
function serializeUnexplodedArray(name, value, options) {
  const joiner = { form: ",", spaceDelimited: "%20", pipeDelimited: "|" }[options.style] || ",";
  const final = value.map((v) => encodeValue(v, options.allowReserved)).join(joiner);
  switch (options.style) {
    case "simple": {
      return final;
    }
    case "label": {
      return `.${final}`;
    }
    case "matrix": {
      return `;${name}=${final}`;
    }
    default: {
      // form, spaceDelimited, pipeDelimited
      return `${name}=${final}`;
    }
  }
}

/**
 * Serialize array param (shallow only). An empty array gives `""`, and so does an exploded
 * `form` array of only `null` and `undefined` items (ADR-041).
 * @type {import("./index.js").serializeArrayParam}
 */
export function serializeArrayParam(name, value, options) {
  if (!Array.isArray(value) || !value.length) {
    return "";
  }
  if (options.explode === false) {
    return serializeUnexplodedArray(name, value, options);
  }
  const values = [];
  for (const v of value) {
    if (options.style === "simple" || options.style === "label") {
      values.push(encodeValue(v, options.allowReserved));
    } else if (v != null) {
      values.push(serializePrimitiveParam(name, v, options));
    }
  }
  return values.length ? joinExploded(values, options.style) : "";
}

/** One query parameter with the default styles: `form` arrays, `deepObject` objects. */
function serializeQueryParam(name, value, options) {
  const allowReserved = options?.allowReserved || false;
  if (Array.isArray(value)) {
    return serializeArrayParam(name, value, {
      style: "form",
      explode: true,
      ...options?.array,
      allowReserved,
    });
  }
  if (value && typeof value === "object" && !isDate(value)) {
    return serializeObjectParam(name, value, {
      style: "deepObject",
      explode: true,
      ...options?.object,
      allowReserved,
    });
  }
  return serializePrimitiveParam(name, value, options);
}

/**
 * Serialize query params to string. A parameter that serializes to nothing (`null`, an empty
 * array or object) is left out with its `&`; an empty part made `a=1&&b=2` (ADR-041).
 * @type {import("./index.js").createQuerySerializer}
 */
export function createQuerySerializer(options) {
  return function querySerializer(queryParams) {
    const search = [];
    if (queryParams && typeof queryParams === "object") {
      for (const key in queryParams) {
        const part = serializeQueryParam(encodeName(key), queryParams[key], options);
        if (part) {
          search.push(part);
        }
      }
    }
    return search.join("&");
  };
}

/**
 * Handle different OpenAPI 3.x serialization styles
 * @type {import("./index.js").defaultPathSerializer}
 * @see https://swagger.io/docs/specification/serialization/#path
 */
export function defaultPathSerializer(pathname, pathParams) {
  const matches = pathname.match(PATH_PARAM_RE);
  if (!matches) {
    return pathname;
  }
  let nextURL = pathname;
  for (const match of matches) {
    let name = match.substring(1, match.length - 1);
    let explode = false;
    let style = "simple";
    if (name.endsWith("*")) {
      explode = true;
      name = name.substring(0, name.length - 1);
    }
    if (name.startsWith(".")) {
      style = "label";
      name = name.substring(1);
    } else if (name.startsWith(";")) {
      style = "matrix";
      name = name.substring(1);
    }
    if (!pathParams || pathParams[name] === undefined || pathParams[name] === null) {
      continue;
    }
    const value = pathParams[name];
    let serialized;
    if (Array.isArray(value)) {
      serialized = serializeArrayParam(name, value, { style, explode });
    } else if (typeof value === "object" && !isDate(value)) {
      serialized = serializeObjectParam(name, value, { style, explode });
    } else if (style === "matrix") {
      serialized = `;${serializePrimitiveParam(name, value)}`;
    } else {
      serialized = style === "label" ? `.${encodeValue(value)}` : encodeValue(value);
    }
    // A function: a string replacement reads `$'`, `$&` and the like, which object keys keep.
    nextURL = nextURL.replace(match, () => serialized);
  }
  checkSerializedPath(pathname, nextURL);
  return nextURL;
}

/**
 * Throw when the path parameters moved the request. Only the path part (before `?` or `#`) from the
 * segment of the first parameter on is checked: the text before it is the `baseUrl` and the
 * template, which no value changes, and a protocol-relative base (`//api.example/v1`) is valid.
 * Values are percent-encoded, so they add no `/` and segment `i` of the URL comes from segment `i`
 * of the template. The message names that template segment, never the URL: the `baseUrl` and the
 * values may carry secrets (a token in the path, credentials in the base), and errors reach logs
 * (ADR-041).
 */
function checkSerializedPath(template, url) {
  const fixed = template.slice(0, template.search(PATH_PARAM_RE));
  const path = url.split(QUERY_OR_FRAGMENT_RE, 1)[0];
  const first = fixed.split("/").length - 1;
  // `encodeURIComponent` keeps dots, so a value `..` would move the request up a path level
  // (ADR-013).
  let index = path
    .split("/")
    .findIndex((segment, at) => at >= first && DOT_SEGMENT_RE.test(segment));
  let problem = "Dot";
  // `//host/…` is a protocol-relative URL: with a relative baseUrl a browser sends it to that host
  // (ADR-030).
  if (index === -1 && path.startsWith("//") && !fixed.startsWith("//")) {
    [index, problem] = [1, "Empty first"];
  }
  if (index !== -1) {
    const name = template.split(QUERY_OR_FRAGMENT_RE, 1)[0].split("/")[index];
    throw new Error(`${problem} path segment in "${name}"`);
  }
}

/**
 * The type tag of a value (`Object.prototype.toString`): the classes of the Fetch API and the
 * built-ins name themselves with it in every realm and in other implementations such as the
 * `undici` package. `instanceof` checked the class of this realm only, so a FormData from undici
 * was JSON-encoded as `{}` (ADR-030). A runtime that lacks a class (React Native has no
 * `ReadableStream`) simply has no value with its tag.
 */
function typeTag(value) {
  return Object.prototype.toString.call(value).slice(TYPE_TAG_START, TYPE_TAG_END);
}

function isFormData(value) {
  return (
    typeTag(value) === "FormData" &&
    typeof value.append === "function" &&
    typeof value.entries === "function"
  );
}

/** A `Blob` or a `File`, of any realm. */
function isBlob(value) {
  return BLOB_TAGS.has(typeTag(value)) && typeof value.arrayBuffer === "function";
}

function isReadableStream(value) {
  return typeTag(value) === "ReadableStream" && typeof value.getReader === "function";
}

/**
 * The FormData as an instance of the client's `FormData` class. A `Request` takes only its own
 * implementation's FormData: undici's read the platform's as the text `[object FormData]`. So a
 * FormData of another class, such as the one the client builds for a multipart body, is copied
 * into one of the `FormData` option, the class of the `Request` option's implementation.
 */
function asFormDataOf(FormDataClass, form) {
  if (typeof FormDataClass !== "function" || form instanceof FormDataClass) {
    return form;
  }
  const copy = new FormDataClass();
  for (const [name, value] of form.entries()) {
    copy.append(name, value);
  }
  // The copy has a boundary of its own, so a `Content-Type` written for the original is wrong.
  copy[CLIENT_BUILT_FORM] = true;
  return copy;
}

/**
 * A stream body: a `ReadableStream`, or an async iterable such as a Node.js `Readable`, which
 * `fetch` in Node.js, Deno and Bun also streams. Both need `duplex: "half"` (ADR-013, decision 6).
 */
function isStreamBody(body) {
  return isReadableStream(body) || typeof body?.[Symbol.asyncIterator] === "function";
}

/**
 * Bodies `fetch` sends as they are, with their own `Content-Type` (FormData, Blob, URLSearchParams)
 * or none. JSON-encoding a Blob, an ArrayBuffer or a stream sent `{}` (ADR-013, decision 6).
 */
function isRawBody(body) {
  return (
    isFormData(body) ||
    isBlob(body) ||
    RAW_BODY_TAGS.has(typeTag(body)) ||
    ArrayBuffer.isView(body) ||
    isStreamBody(body)
  );
}

/**
 * Whether a form item is nested: an object or an array, which form encodings cannot hold. A `Date`
 * is not. A field holds one level of array, so its items are checked, not the field.
 */
function isNestedFormValue(value) {
  return value && typeof value === "object" && !isDate(value);
}

/**
 * The items of a form field: the items of an array, with a hole as `undefined` (`flat()` dropped
 * holes, while `null` and `undefined` items stayed), or the value alone.
 */
function formItems(value) {
  return Array.isArray(value) ? Array.from(value) : [value];
}

/**
 * A form body. A nested object or array, also as an array item, has no standard form encoding
 * (servers read `a[b]`, `a.b` or JSON), and `URLSearchParams` wrote it as `[object Object]` or
 * flattened it (ADR-013, decision 7). `null` and `undefined` fields are left out, as in a multipart
 * body; `URLSearchParams` sent them as the text "null" and "undefined" (ADR-030). A string or a
 * list of pairs is form data already.
 */
function formBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return new URLSearchParams(body).toString();
  }
  const form = new URLSearchParams();
  for (const [name, value] of Object.entries(body)) {
    const items = formItems(value);
    if (items.some(isNestedFormValue)) {
      throw new Error(NESTED_FORM_VALUE_MESSAGE);
    }
    if (value != null) {
      // An array is one comma-separated value, as `URLSearchParams` writes it.
      form.append(name, items.map(valueText).join(","));
    }
  }
  return form.toString();
}

/**
 * A `multipart/form-data` body: one part per field, one per item of an array. A `Blob` (or `File`)
 * is a file part, other primitives are text, `null` and `undefined` are left out. A nested object
 * or array would need a part content type such as JSON, which the client does not guess (ADR-013,
 * decision 10). The FormData is marked as the client's, so its `Content-Type` is the platform's.
 * A symbol key is not a form field, and `Object.keys` and JSON leave it out.
 */
function multipartBody(body) {
  const formData = new FormData();
  formData[CLIENT_BUILT_FORM] = true;
  for (const [name, value] of Object.entries(body)) {
    for (const item of formItems(value)) {
      if (isBlob(item)) {
        formData.append(name, item);
      } else if (isNestedFormValue(item)) {
        throw new Error(NESTED_FORM_VALUE_MESSAGE);
      } else if (item != null) {
        formData.append(name, String(valueText(item)));
      }
    }
  }
  return formData;
}

/**
 * Serialize body object to string
 * @type {import("./index.js").defaultBodySerializer}
 */
export function defaultBodySerializer(body, headers) {
  if (isRawBody(body)) {
    return body;
  }
  // Headers with a `get` are read directly: headers from another realm (iframe, `node:vm`) may have
  // nothing else (upstream #2637). A record or a list of pairs is read through `Headers`, which
  // matches the name in any letter case.
  const contentType =
    headers && (isHeaders(headers) ? headers : mergeHeaders(headers)).get("Content-Type");
  if (FORM_MEDIA_TYPE_RE.test(contentType)) {
    return formBody(body);
  }
  if (body && typeof body === "object" && MULTIPART_MEDIA_TYPE_RE.test(contentType)) {
    return multipartBody(body);
  }
  // A string for a non-JSON media type (`text/plain`, ...) is the body itself; JSON-encoding it
  // added quotes (upstream #2555, #2382). For JSON, a string is a JSON string value (ADR-013).
  if (typeof body === "string" && contentType && !JSON_MEDIA_TYPE_RE.test(contentType)) {
    return body;
  }
  return JSON.stringify(body);
}

/**
 * Construct URL string from baseUrl and handle path and query params
 * @type {import("./index.js").createFinalURL}
 */
export function createFinalURL(pathname, options) {
  let finalURL = `${options.baseUrl}${pathname}`;
  if (options.params?.path) {
    finalURL = options.pathSerializer(finalURL, options.params.path);
  }
  let search = options.querySerializer(options.params.query ?? {});
  if (search.startsWith("?")) {
    search = search.substring(1);
  }
  if (search) {
    // A path may already have a query string.
    finalURL += `${finalURL.includes("?") ? "&" : "?"}${search}`;
  }
  return finalURL;
}

/**
 * Merge headers a and b, with b taking priority
 * @type {import("./index.js").mergeHeaders}
 */
export function mergeHeaders(...allHeaders) {
  const finalHeaders = new Headers();
  for (const h of allHeaders) {
    if (!h || typeof h !== "object") {
      continue;
    }
    // A list of pairs (`[["x-t", "1"]]`) is a `HeadersInit` too; `Headers` joins a repeated name.
    const iterator = isHeaders(h)
      ? h.entries()
      : Symbol.iterator in h
        ? new Headers(h).entries()
        : Object.entries(h);
    for (const [k, v] of iterator) {
      if (v === null) {
        finalHeaders.delete(k);
      } else if (Array.isArray(v)) {
        for (const v2 of v) {
          finalHeaders.append(k, v2);
        }
      } else if (v !== undefined) {
        finalHeaders.set(k, v);
      }
    }
  }
  return finalHeaders;
}

/**
 * Remove trailing slash from url
 * @type {import("./index.js").removeTrailingSlash}
 */
export function removeTrailingSlash(url) {
  if (url.endsWith("/")) {
    return url.substring(0, url.length - 1);
  }
  return url;
}
