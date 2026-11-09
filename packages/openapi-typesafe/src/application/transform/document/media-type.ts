import { irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { appendPointer, createRef } from "../../../domain/openapi/json-pointer.js";
import {
  type ContentMap,
  isMediaTypeComponentRef,
  type MediaTypeObject,
} from "../../../domain/openapi/media-type-object.js";
import { documentEntries } from "../document-entries.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { documentMember } from "./document-member.js";

/** The sibling of `content` that holds item types (ADR-020). */
const ITEM_CONTENT_KEY = "itemContent";

/** A media type's schema, or `unknown` when it has none (OpenAPI 3.1 §4.8.14). */
export function mediaTypeType(
  mediaType: MediaTypeObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  return mediaType.schema ? transformSchema(mediaType.schema, location, context) : UNKNOWN_TYPE;
}

/** A `content` entry: a `$ref` is transformed like a schema `$ref`, the rest as a media type. */
export function contentEntryType(
  entry: ContentMap[string],
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  // `in` throws for a null entry, as in the original.
  return "$ref" in entry
    ? transformSchema(entry, location, context)
    : mediaTypeType(entry, location, context);
}

/** The `itemSchema` of a `content` entry and where it is, following a `$ref` to a component. */
function itemSchemaAt(
  entry: ContentMap[string],
  path: string,
  context: SchemaContext,
): { readonly schema: MediaTypeObject["itemSchema"]; readonly path: string } {
  if ("$ref" in entry) {
    // Other `$ref`s in `content` keep their pre-3.2 output, so only media type components count.
    const resolved = isMediaTypeComponentRef(entry.$ref)
      ? (context.refs.resolve(entry.$ref) as MediaTypeObject | undefined)
      : undefined;
    // `createRef` reads the `$ref` itself as a pointer; only the constant segment is appended.
    return { schema: resolved?.itemSchema, path: createRef([entry.$ref, "itemSchema"]) };
  }
  return { schema: entry.itemSchema, path: appendPointer(path, ["itemSchema"]) };
}

/**
 * `itemContent`: the type of one item of each media type with an `itemSchema` (OpenAPI 3.2), next
 * to `content`, which keeps the type of the complete body. Null when no media type has one.
 */
export function itemContentMember(
  content: ContentMap,
  location: SchemaLocation,
  context: SchemaContext,
  flags: { readonly isReadonly: boolean },
): IrPropertySignature | null {
  const members = documentEntries(content, context.options).flatMap(([mediaType, entry]) => {
    const contentPath = appendPointer(location.path, ["content", mediaType]);
    const item = itemSchemaAt(entry, contentPath, context);
    if (item.schema === undefined) {
      return [];
    }
    const type = transformSchema(item.schema, { ...location, path: item.path }, context);
    return [documentMember(mediaType, type, entry, { isReadonly: context.options.immutable })];
  });
  return members.length > 0
    ? irProperty(toPropertyName(ITEM_CONTENT_KEY), irObject(members), flags)
    : null;
}
