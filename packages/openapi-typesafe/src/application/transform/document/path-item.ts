import { irKeyword, irObject, irProperty } from "../../../domain/ir/constructors.js";
import type { IrMember, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { appendPointer, ROOT_POINTER } from "../../../domain/openapi/json-pointer.js";
import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import type {
  ParameterObject,
  ParameterOrReference,
} from "../../../domain/openapi/parameter-object.js";
import {
  ADDITIONAL_OPERATIONS_KEY,
  HTTP_METHODS,
  type OperationEntry,
  type PathItemMethod,
  type PathItemObject,
  QUERY_METHOD,
} from "../../../domain/openapi/path-item-object.js";
import { documentEntries } from "../document-entries.js";
import { refType } from "../ref-type.js";
import type { SchemaLocation } from "../schema/schema-context.js";
import type { TransformContext } from "../transform-context.js";
import { documentMember } from "./document-member.js";
import { operationMembers } from "./operation.js";
import { parametersMember } from "./parameters.js";

/** Redocly reads `#` in an operation ID as a pointer, so it is replaced (upstream issue #1542). */
const HASH_RE = /#/g;

/** The `operations` key an `operationId` asks for, before a repeated one gets a number. */
export function operationKeyOf(operationId: string): string {
  return operationId.replace(HASH_RE, "/");
}

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
  const operationId = context.footer.operationKey(operationKeyOf(operation.operationId));
  context.footer.addOperation(() =>
    irProperty(toPropertyName(operationId), irObject(operationMembers(merged, location, context)), {
      isReadonly: context.options.immutable,
    }),
  );
  return refType(appendPointer(ROOT_POINTER, ["operations", operationId]));
}

/** An included operation, the member name it gets and its location below the path item. */
interface DeclaredOperation {
  readonly name: string;
  readonly operation: OperationEntry;
  readonly path: string;
}

function operationMember(
  { name, operation, path }: DeclaredOperation,
  pathItem: PathItemObject,
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature {
  const type =
    "$ref" in operation
      ? refType(operation.$ref)
      : operationType(pathItem, operation, { ...location, path }, context);
  return documentMember(name, type, operation, { isReadonly: context.options.immutable });
}

/** A method member: the operation, or `?: never` when there is none or it is excluded. */
function methodMember(
  method: PathItemMethod,
  pathItem: PathItemObject,
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature {
  const operation = pathItem[method];
  if (!isIncluded(operation, context)) {
    const isReadonly = context.options.immutable;
    return irProperty(toPropertyName(method), irKeyword("never"), { isOptional: true, isReadonly });
  }
  const path = appendPointer(location.path, [method]);
  return operationMember({ name: method, operation, path }, pathItem, location, context);
}

/**
 * `additionalOperations` (OpenAPI 3.2): the included operations keyed by their exact method name,
 * or null when the path item has none left.
 */
function additionalOperationsMember(
  pathItem: PathItemObject,
  location: SchemaLocation,
  context: TransformContext,
): IrPropertySignature | null {
  const entries = documentEntries(pathItem.additionalOperations ?? {}, context.options);
  const members = entries
    .filter(([, operation]) => isIncluded(operation, context))
    .map(([method, operation]) => {
      const path = appendPointer(location.path, [ADDITIONAL_OPERATIONS_KEY, method]);
      return operationMember({ name: method, operation, path }, pathItem, location, context);
    });
  return members.length > 0
    ? irProperty(toPropertyName(ADDITIONAL_OPERATIONS_KEY), irObject(members), {
        isReadonly: context.options.immutable,
      })
    : null;
}

/**
 * A path item (OpenAPI 3.2 §4.8.9): its `parameters`, one member per HTTP method, then `query` and
 * `additionalOperations` when the path item declares them (ADR-020).
 */
export function pathItemType(
  pathItem: PathItemObject,
  location: SchemaLocation,
  context: TransformContext,
): IrType {
  const parametersLocation = { ...location, path: appendPointer(location.path, ["parameters"]) };
  const members: IrMember[] = [
    parametersMember(pathItem.parameters ?? [], parametersLocation, context),
    ...HTTP_METHODS.map((method) => methodMember(method, pathItem, location, context)),
  ];
  if (pathItem[QUERY_METHOD] !== undefined) {
    members.push(methodMember(QUERY_METHOD, pathItem, location, context));
  }
  const additionalOperations = additionalOperationsMember(pathItem, location, context);
  if (additionalOperations) {
    members.push(additionalOperations);
  }
  return irObject(members);
}
