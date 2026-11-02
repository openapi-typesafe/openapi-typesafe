import type ts from "typescript";
import { toStatement } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import { apiPathsEnumDeclaration } from "../application/transform/document/paths-enum.js";
import type { PathsObject } from "../types.js";

/** The `ApiPaths` enum (`--make-paths-enum`), built in IR (ENGINEERING_PLAN Phase 5, step 6). */
export default function makeApiPathsEnum(pathsObject: PathsObject): ts.EnumDeclaration {
  return toStatement(apiPathsEnumDeclaration(pathsObject)) as ts.EnumDeclaration;
}
