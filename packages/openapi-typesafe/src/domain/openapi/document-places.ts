import { ADDITIONAL_OPERATIONS_KEY, HTTP_METHODS, QUERY_METHOD } from "./path-item-object.js";

/**
 * The places of an OpenAPI document that a JSON Pointer passes through, read from the document's
 * structure rather than from the words of the pointer. `named*` places and `callback` are maps
 * whose next segment is a name (a path, a component name, a callback expression). `outside` (a
 * root key that is no document key), `input` (a parameter or a request body) and `other` end the
 * walk.
 */
export type DocumentPlace =
  | "root"
  | "outside"
  | "components"
  | "namedPathItems"
  | "namedCallbacks"
  | "callback"
  | "pathItem"
  | "namedOperations"
  | "operation"
  | "input"
  | "other";

const OPERATION_KEYS: ReadonlySet<string> = new Set([...HTTP_METHODS, QUERY_METHOD]);

/** The place each fixed field leads to; any other field leads to `other`. */
const FIELDS: Readonly<Partial<Record<DocumentPlace, Readonly<Record<string, DocumentPlace>>>>> = {
  root: {
    paths: "namedPathItems",
    webhooks: "namedPathItems",
    components: "components",
    $defs: "other",
  },
  components: {
    parameters: "input",
    requestBodies: "input",
    pathItems: "namedPathItems",
    callbacks: "namedCallbacks",
  },
  pathItem: { parameters: "input", [ADDITIONAL_OPERATIONS_KEY]: "namedOperations" },
  operation: { parameters: "input", requestBody: "input", callbacks: "namedCallbacks" },
};

/** Maps whose every key leads to the same place. */
const NAMED: Readonly<Partial<Record<DocumentPlace, DocumentPlace>>> = {
  namedPathItems: "pathItem",
  namedCallbacks: "callback",
  callback: "pathItem",
  namedOperations: "operation",
};

function nextPlace(place: DocumentPlace, segment: string): DocumentPlace {
  const named = NAMED[place];
  if (named !== undefined) {
    return named;
  }
  if (place === "pathItem" && OPERATION_KEYS.has(segment)) {
    return "operation";
  }
  const fields = FIELDS[place] ?? {};
  if (Object.hasOwn(fields, segment)) {
    return fields[segment] as DocumentPlace;
  }
  return place === "root" ? "outside" : "other";
}

const TERMINAL_PLACES: ReadonlySet<DocumentPlace> = new Set(["outside", "input", "other"]);

/** The place the segments of a pointer (after `#`) lead to; the walk stops at a terminal place. */
export function placeOf(segments: Iterable<string>): DocumentPlace {
  let place: DocumentPlace = "root";
  for (const segment of segments) {
    place = nextPlace(place, segment);
    if (TERMINAL_PLACES.has(place)) {
      return place;
    }
  }
  return place;
}
