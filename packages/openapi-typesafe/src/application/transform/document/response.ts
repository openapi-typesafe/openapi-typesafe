import {
  irKeyword,
  irObject,
  irProperty,
  irStringIndexSignature,
} from "../../../domain/ir/constructors.js";
import type { IrMember, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import {
  isMediaTypeComponentRef,
  type MediaTypeObject,
} from "../../../domain/openapi/media-type-object.js";
import type { ResponseObject } from "../../../domain/openapi/response-object.js";
import { documentEntries } from "../document-entries.js";
import { refType } from "../ref-type.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { documentMember } from "./document-member.js";
import { headerType } from "./header.js";
import { contentEntryType, itemContentMember, mediaTypeType } from "./media-type.js";

type HeaderEntry = NonNullable<ResponseObject["headers"]>[string];

function headerMember(
  name: string,
  header: HeaderEntry,
  location: SchemaLocation,
  context: SchemaContext,
): IrPropertySignature {
  // A referenced header counts as required: the reference does not say otherwise.
  const isReference = "$ref" in header;
  const type = isReference
    ? refType(header.$ref)
    : headerType(
        header,
        { ...location, path: createRef([location.path, "headers", name]) },
        context,
      );
  return documentMember(name, type, header, {
    isReadonly: context.options.immutable,
    isOptional: !isReference && !header.required,
  });
}

/** The listed headers, then `[name: string]: unknown`, because servers may send others. */
function headersMember(
  response: ResponseObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrPropertySignature {
  const entries = documentEntries(response.headers ?? {}, context.options);
  const members: IrMember[] = entries.map(([name, header]) =>
    headerMember(name, header, location, context),
  );
  members.push(irStringIndexSignature("name", UNKNOWN_TYPE, context.options.immutable));
  return irProperty(toPropertyName("headers"), irObject(members));
}

/**
 * One media type of a response. The original reads a `$ref` entry as a media type without a
 * schema, so it is `unknown`; a `$ref` to an OpenAPI 3.2 media type component is typed as it.
 */
function mediaTypeEntryType(
  entry: NonNullable<ResponseObject["content"]>[string],
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  return "$ref" in entry && isMediaTypeComponentRef(entry.$ref)
    ? contentEntryType(entry, location, context)
    : mediaTypeType(entry as MediaTypeObject, location, context);
}

/** `content` with one member per media type, or `content?: never` when there are none. */
function contentMember(
  response: ResponseObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrPropertySignature {
  const entries = documentEntries(response.content ?? {}, context.options);
  const members = entries.map(([contentType, entry]) => {
    const path = createRef([location.path, "content", contentType]);
    const type = mediaTypeEntryType(entry, { ...location, path }, context);
    return documentMember(contentType, type, entry, { isReadonly: context.options.immutable });
  });
  const name = toPropertyName("content");
  return members.length > 0
    ? irProperty(name, irObject(members))
    : irProperty(name, irKeyword("never"), { isOptional: true });
}

/**
 * A response (OpenAPI 3.2 §4.8.17): `{ headers: {…}; content: {…} }`, and `itemContent` when a
 * media type has an `itemSchema`. No member is readonly, even with --immutable, as in the original.
 */
export function responseType(
  response: ResponseObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  const itemContent = itemContentMember(response.content ?? {}, location, context, {
    isReadonly: false,
  });
  return irObject([
    headersMember(response, location, context),
    contentMember(response, location, context),
    ...(itemContent ? [itemContent] : []),
  ]);
}
