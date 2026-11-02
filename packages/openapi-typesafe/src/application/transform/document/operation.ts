import { irKeyword, irProperty } from "../../../domain/ir/constructors.js";
import type { IrPropertySignature } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import type { RequestBodyObject } from "../../../domain/openapi/request-body-object.js";
import { refType } from "../ref-type.js";
import type { SchemaLocation } from "../schema/schema-context.js";
import type { TransformContext } from "../transform-context.js";
import { documentMember } from "./document-member.js";
import { parametersMember } from "./parameters.js";
import { requestBodyType } from "./request-body.js";
import { responsesType } from "./responses.js";

/** `requestBody`, optional unless the (resolved) body is required; `requestBody?: never` if none. */
function requestBodyMember(
  operation: OperationObject,
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature {
  const isReadonly = context.options.immutable;
  const body = operation.requestBody;
  if (!body) {
    return irProperty(toPropertyName("requestBody"), irKeyword("never"), {
      isOptional: true,
      isReadonly,
    });
  }
  const isReference = "$ref" in body;
  const type = isReference
    ? refType(body.$ref)
    : requestBodyType(
        body,
        { ...location, path: createRef([location.path, "requestBody"]) },
        context,
      );
  const resolved = isReference
    ? (context.refs.resolve(body.$ref) as RequestBodyObject | undefined)
    : body;
  return documentMember("requestBody", type, body, {
    isReadonly,
    isOptional: !resolved?.required,
  });
}

/**
 * The members of an operation (OpenAPI 3.1 §4.8.10): `parameters`, `requestBody` and `responses`.
 * `location.path` is the operation's pointer.
 */
export function operationMembers(
  operation: OperationObject,
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature[] {
  // Built in document order: each part may add footer declarations (enums), in this order.
  const parameters = parametersMember(operation.parameters ?? [], location, context);
  const requestBody = requestBodyMember(operation, location, context);
  const responses = responsesType(operation.responses ?? {}, location, context);
  return [
    parameters,
    requestBody,
    irProperty(toPropertyName("responses"), responses, { isReadonly: context.options.immutable }),
  ];
}
