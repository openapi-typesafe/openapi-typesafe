// The fork-base paths-enum transformer, kept as the reference for the parity tests
// (ENGINEERING_PLAN Phase 5: no behavior changes). Not linted: it is upstream code as it was.
import type ts from "typescript";
import { tsEnum } from "./lib/ts.js";
import { getEntries } from "./lib/utils.js";
import type { PathsObject } from "./lib/types.js";

export default function makeApiPathsEnum(pathsObject: PathsObject): ts.EnumDeclaration {
  const enumKeys = [];
  const enumMetaData = [];

  for (const [url, pathItemObject] of getEntries(pathsObject)) {
    for (const [method, operation] of Object.entries(pathItemObject)) {
      if (!["get", "put", "post", "delete", "options", "head", "patch", "trace"].includes(method)) {
        continue;
      }

      // Generate a name from the operation ID
      let pathName: string;
      if (operation.operationId) {
        pathName = operation.operationId;
      } else {
        // If the operation ID is not present, construct a name from the method and path
        pathName = (method + url)
          .split("/")
          .map((part) => {
            const capitalised = part.charAt(0).toUpperCase() + part.slice(1);

            // Remove any characters not allowed as enum keys, and attempt to remove
            //  named parameters.
            return capitalised.replace(/{.*}|:.*|[^a-zA-Z\d_]+/, "");
          })
          .join("");
      }
      enumKeys.push(url);
      enumMetaData.push({
        name: pathName,
      });
    }
  }

  return tsEnum("ApiPaths", enumKeys, enumMetaData, {
    export: true,
  });
}
