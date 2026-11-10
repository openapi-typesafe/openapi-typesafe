import type { IrEnumDeclaration } from "../../../domain/ir/nodes.js";
import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import {
  ADDITIONAL_OPERATIONS_KEY,
  HTTP_METHODS,
  type OperationEntry,
  type PathItemMethod,
  type PathsObject,
  QUERY_METHOD,
} from "../../../domain/openapi/path-item-object.js";
import { EnumNaming, enumDeclaration } from "../footer/enum-naming.js";
import { withNumberedRepeats } from "../numbered-names.js";
import type { EnumMemberMetadata } from "../schema/schema-context.js";

/** A path segment that is one parameter: `{user_id}` or `:user_id`. */
const PARAMETER_SEGMENT_RE = /^(?:{(.+)}|:(.+))$/;
/** Characters not allowed in an enum key, or a `{param}` / `:param` part (first match only). */
const INVALID_KEY_PART_RE = /{.*}|:.*|[^a-zA-Z\d_]+/;
export const API_PATHS_NAME = "ApiPaths";
const METHODS: ReadonlySet<string> = new Set<PathItemMethod>([...HTTP_METHODS, QUERY_METHOD]);

/** The members of the `ApiPaths` enum (`--make-paths-enum`). */
export interface ApiPathsEnum {
  readonly values: readonly string[];
  readonly metadata: readonly EnumMemberMetadata[];
}

/** `getUsersById` style key from the method and URL, when the operation has no ID. */
function keyFromUrl(method: string, url: string): string {
  return `${method}${url}`
    .split("/")
    .map((part) => {
      const capitalized = part.charAt(0).toUpperCase() + part.slice(1);
      return capitalized.replace(INVALID_KEY_PART_RE, "");
    })
    .join("");
}

/** `user_id` and `order-id` as `UserId` and `OrderId`. */
function parameterWord(name: string): string {
  return name
    .split(/[^a-zA-Z\d]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

/** The key with parameters named, `GetUserByUserId`, for keys that collide without them. */
function keyWithParameters(method: string, url: string): string {
  const parts = url.split("/").map((part) => {
    const parameter = PARAMETER_SEGMENT_RE.exec(part);
    const name = parameter?.[1] ?? parameter?.[2];
    return name === undefined ? part : `By${parameterWord(name)}`;
  });
  return keyFromUrl(method, parts.join("/"));
}

interface PathOperation {
  readonly url: string;
  readonly method: string;
  readonly operationId: string | undefined;
}

/**
 * The operations of one path item in document order; `additionalOperations` (OpenAPI 3.2) adds
 * its methods where the key stands.
 */
function pathItemEntries(pathItem: object): [string, unknown][] {
  return Object.entries(pathItem).flatMap(([key, value]): [string, unknown][] => {
    if (key === ADDITIONAL_OPERATIONS_KEY) {
      return typeof value === "object" && value !== null ? Object.entries(value) : [];
    }
    return METHODS.has(key) ? [[key, value]] : [];
  });
}

/** Which operations get a member; the generator leaves out those `--exclude-deprecated` drops. */
export type OperationFilter = (operation: OperationEntry) => boolean;

const INCLUDES_EVERY_OPERATION: OperationFilter = () => true;

function pathOperations(paths: PathsObject, isIncluded: OperationFilter): PathOperation[] {
  return Object.entries(paths).flatMap(([url, pathItem]) =>
    pathItemEntries(pathItem)
      .filter(([, operation]) => isIncluded(operation as OperationEntry))
      .map(([method, operation]) => {
        const operationId = (operation as OperationObject).operationId || undefined;
        return { url, method, operationId };
      }),
  );
}

function countOf(names: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Names that are unique, so the enum compiles (upstream #2194). A URL key that collides names
 * its parameters; a name that still collides gets 2, 3… after its first use.
 */
function uniqueNames(operations: readonly PathOperation[]): string[] {
  const keys = operations.map((op) => op.operationId ?? keyFromUrl(op.method, op.url));
  const counts = countOf(keys);
  const named = operations.map((op, index) => {
    const isCollidingUrlKey =
      op.operationId === undefined && (counts.get(keys[index] as string) ?? 0) > 1;
    return isCollidingUrlKey ? keyWithParameters(op.method, op.url) : (keys[index] as string);
  });
  return withNumberedRepeats(named, (name, count) => `${name}${count}`);
}

/**
 * One enum member per operation: the URL as the value, the operation ID (or a key built from the
 * method and URL) as the name. Paths are in document order; `--alphabetize` does not apply.
 */
export function apiPathsEnum(
  paths: PathsObject,
  isIncluded: OperationFilter = INCLUDES_EVERY_OPERATION,
): ApiPathsEnum {
  const operations = pathOperations(paths, isIncluded);
  const names = uniqueNames(operations);
  return {
    values: operations.map((operation) => operation.url),
    metadata: names.map((name) => ({ name, description: undefined })),
  };
}

/**
 * The `ApiPaths` enum declaration. Its own naming state is equivalent to the run's: the name is a
 * valid identifier, and member names only reset the state, never read it.
 */
export function apiPathsEnumDeclaration(
  paths: PathsObject,
  isIncluded: OperationFilter = INCLUDES_EVERY_OPERATION,
): IrEnumDeclaration {
  const naming = new EnumNaming();
  return enumDeclaration(naming.enumName(API_PATHS_NAME), apiPathsEnum(paths, isIncluded), naming);
}
