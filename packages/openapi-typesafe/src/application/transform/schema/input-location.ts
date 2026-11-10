import { placeOf } from "../../../domain/openapi/document-places.js";
import { parseRefPointer } from "../../../domain/openapi/json-pointer.js";
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
  const place = placeOf(parseRefPointer(path));
  return place === "outside" ? namesInput(path) : place === "input";
}
