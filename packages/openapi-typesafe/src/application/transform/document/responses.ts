import { irKeyword, irObject } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { ResponsesObject } from "../../../domain/openapi/response-object.js";
import { documentEntries } from "../document-entries.js";
import { refType } from "../ref-type.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { documentMember } from "./document-member.js";
import { responseType } from "./response.js";

/** Responses by status code (OpenAPI 3.1 §4.8.16), or `never` when there are none. */
export function responsesType(
  responses: ResponsesObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  const members = documentEntries(responses, context.options).map(([code, response]) => {
    const type =
      "$ref" in response
        ? refType(response.$ref)
        : responseType(
            response,
            { ...location, path: createRef([location.path, "responses", code]) },
            context,
          );
    return documentMember(code, type, response, { isReadonly: context.options.immutable });
  });
  return members.length > 0 ? irObject(members) : irKeyword("never");
}
