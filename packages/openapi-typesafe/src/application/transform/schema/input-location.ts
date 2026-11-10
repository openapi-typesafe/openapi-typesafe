import { parseRefPointer } from "../../../domain/openapi/json-pointer.js";
import {
  ADDITIONAL_OPERATIONS_KEY,
  HTTP_METHODS,
  QUERY_METHOD,
} from "../../../domain/openapi/path-item-object.js";
import { FIX, type OutputFix } from "../../../domain/output-fixes.js";

/** The words that mark an input anywhere in a location, as the original reads them. */
const ORIGINAL_INPUT_WORDS = ["parameters", "requestBody", "requestBodies"] as const;

/**
 * Whether a schema location describes an input: a parameter or a request body. A client may
 * leave out an input property that has a `default`, so the default makes no such property
 * required. The original tests the location text for a word, so a schema or path that is only
 * named so (`#/components/schemas/Job/properties/parameters`, `/system-parameters`) counts as an
 * input too. The `default-input-locations` fix reads a pointer into the document by the
 * document's structure instead (ADR-021).
 */
export function isInputLocation(path: string | undefined, fixes: ReadonlySet<OutputFix>): boolean {
  if (path === undefined) {
    return false;
  }
  return fixes.has(FIX.DEFAULT_INPUT_LOCATIONS) ? isStructuralInput(path) : namesInput(path);
}

function namesInput(path: string): boolean {
  return ORIGINAL_INPUT_WORDS.some((word) => path.includes(word));
}

/**
 * Whether the document's structure makes the pointer an input. A path an exported transformer was
 * given that is no pointer into the document (`/items/{id}`) has no known structure, so the
 * original's words still mark an input there.
 */
function isStructuralInput(path: string): boolean {
  let place: Place = "root";
  for (const segment of parseRefPointer(path)) {
    place = nextPlace(place, segment);
    if (place === "outside") {
      return namesInput(path);
    }
    if (place === "input" || place === "other") {
      return place === "input";
    }
  }
  return false;
}

/**
 * The structural places on the way to a schema. `named*` places and `callback` are maps whose
 * next segment is a name (a path, a component name, a callback expression). `outside` (a root key
 * that is no document key), `input` and `other` end the walk.
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
  if (place === "pathItem" && OPERATION_KEYS.has(segment)) {
    return "operation";
  }
  const fields = FIELDS[place] ?? {};
  if (Object.hasOwn(fields, segment)) {
    return fields[segment] as Place;
  }
  return place === "root" ? "outside" : "other";
}
