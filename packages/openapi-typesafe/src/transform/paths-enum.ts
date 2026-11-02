import type ts from "typescript";
import { apiPathsEnum } from "../application/transform/document/paths-enum.js";
import { tsEnum } from "../lib/ts.js";
import type { PathsObject } from "../types.js";

/**
 * The `ApiPaths` enum (`--make-paths-enum`). The members are computed in IR terms (ENGINEERING_PLAN
 * Phase 5, step 5); the declaration is built with `tsEnum` until the enum registry (step 6).
 */
export default function makeApiPathsEnum(pathsObject: PathsObject): ts.EnumDeclaration {
  const { values, metadata } = apiPathsEnum(pathsObject);
  return tsEnum("ApiPaths", [...values], [...metadata], { export: true });
}
