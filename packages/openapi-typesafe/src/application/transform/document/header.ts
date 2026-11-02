import { irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import type { HeaderObject } from "../../../domain/openapi/header-object.js";
import { escapePointerSegment } from "../../../domain/openapi/json-pointer.js";
import type { ContentMap } from "../../../domain/openapi/media-type-object.js";
import { documentEntries } from "../document-entries.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";
import { withSchemaComment } from "../schema-comment.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { mediaTypeType } from "./media-type.js";

function contentMember(
  contentType: string,
  mediaType: ContentMap[string],
  location: SchemaLocation,
  context: SchemaContext,
): IrPropertySignature {
  // The original joins the segment by hand, so a missing path starts from `#`.
  const path = `${location.path ?? "#"}/${escapePointerSegment(contentType)}`;
  const nested = { ...location, path };
  // `in` throws for a null entry, as in the original.
  const type =
    "$ref" in mediaType
      ? transformSchema(mediaType, nested, context)
      : mediaTypeType(mediaType, nested, context);
  const property = irProperty(toPropertyName(contentType), type, {
    isReadonly: context.options.immutable,
  });
  return withSchemaComment(property, mediaType);
}

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
  const entries = documentEntries(header.content, context.options);
  return irObject(
    entries.map(([contentType, mediaType]) =>
      contentMember(contentType, mediaType, location, context),
    ),
  );
}
