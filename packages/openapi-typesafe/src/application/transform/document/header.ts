import { irObject } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { HeaderObject } from "../../../domain/openapi/header-object.js";
import { escapePointerSegment } from "../../../domain/openapi/json-pointer.js";
import { documentEntries } from "../document-entries.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { documentMember } from "./document-member.js";
import { contentEntryType } from "./media-type.js";

/**
 * A header's type (OpenAPI 3.1 §4.8.21): its schema, else an object with one property per media
 * type in `content`, else `unknown`.
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
  const members = documentEntries(header.content, context.options).map(([contentType, entry]) => {
    // Unlike other content maps, the original joins this path by hand: a missing path is `#`.
    const path = `${location.path ?? "#"}/${escapePointerSegment(contentType)}`;
    const type = contentEntryType(entry, { ...location, path }, context);
    return documentMember(contentType, type, entry, { isReadonly: context.options.immutable });
  });
  return irObject(members);
}
