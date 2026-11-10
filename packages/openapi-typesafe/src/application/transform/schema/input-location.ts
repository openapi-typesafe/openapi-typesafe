import { parseRefPointer } from "../../../domain/openapi/json-pointer.js";
import {
  ADDITIONAL_OPERATIONS_KEY,
  HTTP_METHODS,
  QUERY_METHOD,
} from "../../../domain/openapi/path-item-object.js";

/**
 * Whether a schema location describes an input: a parameter or a request body. A client may
 * leave out an input property that has a `default`, so the default makes no such property
 * required. A pointer into the document is read by the document's structure, so a schema or path
 * that is only named `parameters` (`#/components/schemas/Job/properties/parameters`,
 * `/system-parameters`) is no input; the original tested the pointer text for the word.
 */
export function isInputLocation(path: string | undefined): boolean {
  if (path === undefined) {
    return false;
  }
  let place: Place = "root";
  for (const segment of parseRefPointer(path)) {
    place = nextPlace(place, segment);
    if (place === "input" || place === "other") {
      return place === "input";
    }
  }
  return false;
}

/**
 * The structural places on the way to a schema. `named*` places and `callback` are maps whose
 * next segment is a name (a path, a component name, a callback expression). `outside` is a path
 * an exported transformer was given that is no pointer into the document (`/items/{id}`); its
 * structure is unknown, so the original's words still mark an input there. `input` and `other`
 * end the walk.
 */
type Place =
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

/** The segments the original read as an input anywhere in a path. */
const ORIGINAL_INPUT_SEGMENTS: ReadonlySet<string> = new Set([
  "parameters",
  "requestBody",
  "requestBodies",
]);

const OPERATION_KEYS: ReadonlySet<string> = new Set([...HTTP_METHODS, QUERY_METHOD]);

/** The place each fixed field leads to; any other field leads to `other`. */
const FIELDS: Readonly<Partial<Record<Place, Readonly<Record<string, Place>>>>> = {
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
const NAMED: Readonly<Partial<Record<Place, Place>>> = {
  namedPathItems: "pathItem",
  namedCallbacks: "callback",
  callback: "pathItem",
  namedOperations: "operation",
};

function nextPlace(place: Place, segment: string): Place {
  const named = NAMED[place];
  if (named !== undefined) {
    return named;
  }
  if (place === "outside") {
    return ORIGINAL_INPUT_SEGMENTS.has(segment) ? "input" : "outside";
  }
  if (place === "pathItem" && OPERATION_KEYS.has(segment)) {
    return "operation";
  }
  const fields = FIELDS[place] ?? {};
  if (Object.hasOwn(fields, segment)) {
    return fields[segment] as Place;
  }
  return place === "root" ? nextPlace("outside", segment) : "other";
}
