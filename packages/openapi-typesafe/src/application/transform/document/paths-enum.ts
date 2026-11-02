import type { IrEnumDeclaration } from "../../../domain/ir/nodes.js";
import type { OperationObject } from "../../../domain/openapi/operation-object.js";
import {
  HTTP_METHODS,
  type HttpMethod,
  type PathsObject,
} from "../../../domain/openapi/path-item-object.js";
import { EnumNaming, enumDeclaration } from "../footer/enum-naming.js";
import type { EnumMemberMetadata } from "../schema/schema-context.js";

/** Characters not allowed in an enum key, or a `{param}` / `:param` part (first match only). */
const INVALID_KEY_PART_RE = /{.*}|:.*|[^a-zA-Z\d_]+/;
const API_PATHS_NAME = "ApiPaths";
const METHODS: ReadonlySet<string> = new Set<HttpMethod>(HTTP_METHODS);

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

/**
 * One enum member per operation: the URL as the value, the operation ID (or a key built from the
 * method and URL) as the name. Paths are in document order; `--alphabetize` does not apply.
 */
export function apiPathsEnum(paths: PathsObject): ApiPathsEnum {
  const values: string[] = [];
  const metadata: EnumMemberMetadata[] = [];
  for (const [url, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!METHODS.has(method)) {
        continue;
      }
      const operationId = (operation as OperationObject).operationId;
      values.push(url);
      const name = operationId ? operationId : keyFromUrl(method, url);
      metadata.push({ name, description: undefined });
    }
  }
  return { values, metadata };
}

/**
 * The `ApiPaths` enum declaration. Its own naming state is equivalent to the run's: the name is a
 * valid identifier, and member names only reset the state, never read it.
 */
export function apiPathsEnumDeclaration(paths: PathsObject): IrEnumDeclaration {
  const naming = new EnumNaming();
  return enumDeclaration(naming.enumName(API_PATHS_NAME), apiPathsEnum(paths), naming);
}
