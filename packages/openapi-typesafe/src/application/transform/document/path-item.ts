import { irKeyword, irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrMember, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import type {
  ParameterObject,
  ParameterOrReference,
} from "../../../domain/openapi/parameter-object.js";
import {
  HTTP_METHODS,
  type HttpMethod,
  type PathItemObject,
} from "../../../domain/openapi/path-item-object.js";
import type { ReferenceSchema } from "../../../domain/openapi/schema-object.js";
import { refType } from "../ref-type.js";
import type { SchemaLocation } from "../schema/schema-context.js";
import type { TransformContext } from "../transform-context.js";
import { documentMember } from "./document-member.js";
import { operationMembers } from "./operation.js";
import { parametersMember } from "./parameters.js";

/** Redocly reads `#` in an operation ID as a pointer, so it is replaced (upstream issue #1542). */
const HASH_RE = /#/g;

type OperationEntry = OperationObject | ReferenceSchema;

/** Whether the method has an operation, not removed by `--exclude-deprecated`. */
function isIncluded(
  operation: OperationEntry | undefined,
  context: TransformContext,
): operation is OperationEntry {
  if (!operation) {
    return false;
  }
  const resolved =
    "$ref" in operation
      ? (context.refs.resolve(operation.$ref) as OperationObject | undefined)
      : operation;
  return !(context.options.excludeDeprecated && resolved?.deprecated);
}

/**
 * Path item parameters followed by the operation's, keyed by location and name, so an operation
 * parameter replaces the path item parameter it redefines (upstream issue #1798).
 */
function mergedParameters(
  pathItem: PathItemObject,
  operation: OperationObject,
  context: TransformContext,
): ParameterOrReference[] {
  const byKey = new Map<string, ParameterOrReference>();
  for (const parameter of [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])]) {
    const resolved =
      "$ref" in parameter
        ? (context.refs.resolve(parameter.$ref) as ParameterObject | undefined)
        : parameter;
    byKey.set(`${resolved?.in}-${resolved?.name}`, parameter);
  }
  return [...byKey.values()];
}

/**
 * An operation with an `operationId` goes into the `operations` interface and is referenced from
 * the path item; others are written inline.
 */
function operationType(
  pathItem: PathItemObject,
  operation: OperationObject,
  location: SchemaLocation,
  context: TransformContext,
): IrType {
  const merged = { ...operation, parameters: mergedParameters(pathItem, operation, context) };
  if (!operation.operationId) {
    return irObject(operationMembers(merged, location, context));
  }
  const operationId = operation.operationId.replace(HASH_RE, "/");
  context.footer.addOperation(() =>
    irProperty(toPropertyName(operationId), irObject(operationMembers(merged, location, context)), {
      isReadonly: context.options.immutable,
    }),
  );
  return refType(createRef(["operations", operationId]));
}

function methodMember(
  method: HttpMethod,
  pathItem: PathItemObject,
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature {
  const isReadonly = context.options.immutable;
  const operation = pathItem[method];
  if (!isIncluded(operation, context)) {
    return irProperty(toPropertyName(method), irKeyword("never"), { isOptional: true, isReadonly });
  }
  const type =
    "$ref" in operation
      ? refType(operation.$ref)
      : operationType(
          pathItem,
          operation,
          { ...location, path: createRef([location.path, method]) },
          context,
        );
  return documentMember(method, type, operation, { isReadonly });
}

/** A path item (OpenAPI 3.1 §4.8.9): its `parameters`, then one member per HTTP method. */
export function pathItemType(
  pathItem: PathItemObject,
  location: SchemaLocation,
  context: TransformContext,
): IrType {
  const parametersLocation = { ...location, path: createRef([location.path, "parameters"]) };
  const members: IrMember[] = [
    parametersMember(pathItem.parameters ?? [], parametersLocation, context),
  ];
  for (const method of HTTP_METHODS) {
    members.push(methodMember(method, pathItem, location, context));
  }
  return irObject(members);
}
