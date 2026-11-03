import { irKeyword, irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrMember, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { RequestBodyObject } from "../../../domain/openapi/request-body-object.js";
import { documentEntries } from "../document-entries.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { documentMember } from "./document-member.js";
import { contentEntryType, itemContentMember } from "./media-type.js";

/** Stands in for the media types of a body that defines none: `"*\/*"?: never`. */
const ANY_MEDIA_TYPE = "*/*";

function contentMembers(
  requestBody: RequestBodyObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrMember[] {
  const entries = documentEntries(requestBody.content ?? {}, context.options);
  return entries.map(([contentType, entry]) => {
    const path = createRef([location.path, "content", contentType]);
    const type = contentEntryType(entry, { ...location, path }, context);
    return documentMember(contentType, type, entry, { isReadonly: context.options.immutable });
  });
}

/**
 * A request body (OpenAPI 3.2 §4.8.13): `{ content: { [mediaType]: T } }`, and `itemContent` when a
 * media type has an `itemSchema`.
 */
export function requestBodyType(
  requestBody: RequestBodyObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  const members = contentMembers(requestBody, location, context);
  // The placeholder is never readonly, even with --immutable, as in the original.
  const placeholder = irProperty(toPropertyName(ANY_MEDIA_TYPE), irKeyword("never"), {
    isOptional: true,
  });
  const content = irObject(members.length > 0 ? members : [placeholder]);
  const isReadonly = context.options.immutable;
  const itemContent = itemContentMember(requestBody.content ?? {}, location, context, {
    isReadonly,
  });
  return irObject([
    irProperty(toPropertyName("content"), content, { isReadonly }),
    ...(itemContent ? [itemContent] : []),
  ]);
}
