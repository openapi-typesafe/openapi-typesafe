import { parseStatements } from "../adapters/type-ast-bridge/ir-declarations-to-typescript.js";
import { loadTypeScript } from "../adapters/type-ast-bridge/load-typescript.js";
import { DEPRECATION_CODES } from "../domain/deprecations.js";
import { defaultDeprecationReporter } from "./default-ports.js";
import { IR_CALLBACKS_GUIDE_URL } from "./legacy-callback-warning.js";

const STRING_TO_AST_DEPRECATION =
  "stringToAST() is deprecated and removed in 2.0. Return TypeScript type text from an IR " +
  `callback (irCallbacks: true) instead: ${IR_CALLBACKS_GUIDE_URL}`;

/**
 * Convert an arbitrary string to TS (assuming it’s valid). Parses with the TypeScript bridge, so
 * it needs TypeScript 6 or earlier (or `@typescript/typescript6`). Emits a Node.js
 * `DeprecationWarning` (`OPENAPI_TYPESAFE_DEP_STRING_TO_AST`) on the first call only.
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 7). Use type text in IR callbacks.
 */
export function stringToAST(source: string): unknown[] {
  defaultDeprecationReporter().report(
    DEPRECATION_CODES.OPENAPI_TYPESAFE_DEP_STRING_TO_AST,
    STRING_TO_AST_DEPRECATION,
  );
  return [...parseStatements(loadTypeScript(), source)];
}
