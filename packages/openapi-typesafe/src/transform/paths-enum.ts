import { apiPathsEnumDeclaration } from "../application/transform/document/paths-enum.js";
import type { IrEnumDeclaration } from "../domain/ir/nodes.js";
import type { PathsObject } from "../types.js";

/** The `ApiPaths` enum (`--make-paths-enum`), built in IR (ENGINEERING_PLAN Phase 5, step 6). */
export default function makeApiPathsEnum(pathsObject: PathsObject): IrEnumDeclaration {
  return apiPathsEnumDeclaration(pathsObject);
}
