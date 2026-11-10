import { irObject } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { HeaderObject } from "../../../domain/openapi/header-object.js";
import { escapePointerSegment } from "../../../domain/openapi/json-pointer.js";
import type { ContentMap } from "../../../domain/openapi/media-type-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { documentEntries } from "../document-entries.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { documentMember } from "./document-member.js";
import { contentEntryType } from "./media-type.js";

/**
 * A header's type (OpenAPI 3.1 §4.8.21): its schema, else the type of its `content`, else
 * `unknown`. `content` holds one media type whose schema describes the value; the original typed
 * it as an object with one property per media type, which the `parameter-header-content` fix
 * replaces by the media type's type, as for a parameter.
 */
export function headerType(
  header: HeaderObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  if (header.schema) {
    return transformSchema(header.schema, location, context);
  }
  if (!header.content) {
    return UNKNOWN_TYPE;
  }
  if (context.options.fixes.has(FIX.PARAMETER_HEADER_CONTENT)) {
    // The first media type in document order, as for a parameter: `--alphabetize` sorts only
    // the members it writes.
    const first = Object.entries(header.content)[0];
    return first === undefined ? UNKNOWN_TYPE : mediaType(...first, location, context);
  }
  const members = documentEntries(header.content, context.options).map(([contentType, entry]) => {
    const type = mediaType(contentType, entry, location, context);
    return documentMember(contentType, type, entry, { isReadonly: context.options.immutable });
  });
  return irObject(members);
}

/** The type of one media type of a header, at the path the original gave it. */
function mediaType(
  contentType: string,
  entry: ContentMap[string],
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  // Unlike other content maps, the original joins this path by hand: a missing path is `#`.
  const path = `${location.path ?? "#"}/${escapePointerSegment(contentType)}`;
  return contentEntryType(entry, { ...location, path }, context);
}
