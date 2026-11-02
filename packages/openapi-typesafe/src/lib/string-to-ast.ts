import { deprecate } from "node:util";
import { parseStatements } from "../adapters/type-ast-bridge/ir-declarations-to-typescript.js";
import { loadTypeScript } from "../adapters/type-ast-bridge/load-typescript.js";
import { IR_CALLBACKS_GUIDE_URL } from "./legacy-callback-warning.js";

const STRING_TO_AST_DEPRECATION =
  "stringToAST() is deprecated and removed in 2.0. Return TypeScript type text from an IR " +
  `callback (irCallbacks: true) instead: ${IR_CALLBACKS_GUIDE_URL}`;

/** Node's deprecation code for `stringToAST`, so users can filter or trace the warning. */
export const STRING_TO_AST_DEPRECATION_CODE = "OPENAPI_TYPESAFE_DEP_STRING_TO_AST";

function parseSource(source: string): unknown[] {
  return [...parseStatements(loadTypeScript(), source)];
}

/**
 * Convert an arbitrary string to TS (assuming it’s valid). Parses with the TypeScript bridge, so
 * it needs TypeScript 6 or earlier (or `@typescript/typescript6`). Node's `util.deprecate` warns
 * on the first call only.
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 7). Use type text in IR callbacks.
 */
export const stringToAST: (source: string) => unknown[] = deprecate(
  parseSource,
  STRING_TO_AST_DEPRECATION,
  STRING_TO_AST_DEPRECATION_CODE,
);
