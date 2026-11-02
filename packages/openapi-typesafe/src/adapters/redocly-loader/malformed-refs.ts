import { ERROR_CODES, OpenAPITypesafeError } from "../../domain/errors.js";
import { parseRefPointer } from "../../domain/openapi/json-pointer.js";
import { findRefHolders } from "./ref-holders.js";
import type { LoadedDocument } from "./unsupported-keys.js";

/**
 * Redocly percent-decodes every JSON Pointer in a `$ref` and throws a bare `URIError` for a
 * malformed escape such as `#/components/schemas/50%` (`%` must be written `%25`). The loader
 * looks for these refs only after Redocly threw, and names them.
 */

/** Enough refs in the message to act on; `details.refs` has all of them. */
const REFS_IN_MESSAGE = 5;

/** A `$ref` whose pointer has a malformed percent escape, and where it is. */
export interface MalformedRef {
  readonly ref: string;
  readonly pointer: string;
  readonly source: string;
}

function isMalformed(ref: string): boolean {
  try {
    parseRefPointer(ref);
    return false;
  } catch (error) {
    if (error instanceof URIError) {
      return true;
    }
    throw error;
  }
}

/** Every malformed `$ref` of the given documents. */
export function findMalformedRefs(documents: readonly LoadedDocument[]): MalformedRef[] {
  return documents.flatMap((document) =>
    findRefHolders(document.parsed)
      .filter(({ node }) => isMalformed(node.$ref))
      .map(({ node, pointer }) => ({ ref: node.$ref, pointer, source: document.source })),
  );
}

function describeRef(found: MalformedRef): string {
  return `"${found.ref}" at ${found.pointer} in ${found.source}`;
}

/** The typed error for Redocly's `URIError`; `cause` is that error. */
export function malformedRefsError(
  refs: readonly MalformedRef[],
  cause: unknown,
): OpenAPITypesafeError {
  const listed = refs.slice(0, REFS_IN_MESSAGE).map(describeRef);
  const more = refs.length > REFS_IN_MESSAGE ? ` and ${refs.length - REFS_IN_MESSAGE} more` : "";
  const where = listed.length === 0 ? "" : `: ${listed.join(", ")}${more}`;
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_REF_INVALID,
    message: `A $ref has a malformed percent escape; write "%" as "%25" in a JSON Pointer${where}.`,
    details: { reason: "malformed", refs: refs.map((found) => ({ ...found })) },
    cause,
  });
}
