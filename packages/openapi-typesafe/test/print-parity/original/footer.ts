// The fork-base footer adapter (step 5 state of src/lib/transform-context.ts), kept as the
// reference for the footer parity test (ENGINEERING_PLAN Phase 5: no behavior changes).
// Not linted: it is the code as it was.
import ts from "typescript";
import { toPropertySignature, toTypeNode } from "../../../src/adapters/type-ast-bridge/ir-to-typescript.js";
import type { DocumentFooter } from "../../../src/application/transform/transform-context.js";
import { injectOperation, injectWithRequiredHelper } from "./lib/footer-helpers.js";
import { tsArrayLiteralExpression, tsEnum } from "./lib/ts.js";
import type { GlobalContext } from "./lib/types.js";

export default function footer(ctx: GlobalContext): DocumentFooter {
  return {
    addEnum({ name, values, metadata }) {
      const declaration = tsEnum(name, [...values], [...metadata], {
        shouldCache: ctx.dedupeEnums,
        export: true,
      });
      // With --dedupe-enums the cache returns a declaration that may be in the footer already.
      if (!ctx.injectFooter.includes(declaration)) {
        ctx.injectFooter.push(declaration);
      }
      return ts.idText(declaration.name);
    },
    addEnumValues({ name, type, values }) {
      const options = { export: true, readonly: true, injectFooter: ctx.injectFooter };
      ctx.injectFooter.push(
        tsArrayLiteralExpression(name, toTypeNode(type), [...values], options),
      );
    },
    requireWithRequired() {
      injectWithRequiredHelper(ctx.injectFooter);
    },
    addOperation(build) {
      injectOperation(ctx.injectFooter, () => toPropertySignature(build()));
    },
  };
}
