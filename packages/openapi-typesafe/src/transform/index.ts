import type ts from "typescript";
import { toStatements } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import { documentBody, documentClosing } from "../application/transform/document/document.js";
import type { DocumentObject } from "../domain/openapi/document-object.js";
import { createTransformContext } from "../lib/transform-context.js";
import type { GlobalContext, OpenAPI3 } from "../types.js";

const OPERATIONS_NAME = "operations";

/** Whether a footer node is named `operations` (the generator's interface, or a user's node). */
function isOperations(node: ts.Node): boolean {
  return (node as ts.InterfaceDeclaration)?.name?.escapedText === OPERATIONS_NAME;
}

/**
 * The whole document: root types, the footer, then the closing declarations. Ported to IR
 * (ENGINEERING_PLAN Phase 5, step 6); the footer stays a `ts.Node` list until step 7, because
 * user callbacks may add their own nodes to it.
 */
export default function transformSchema(schema: OpenAPI3, ctx: GlobalContext): ts.Node[] {
  const document = schema as DocumentObject;
  const context = createTransformContext(ctx);
  const body = documentBody(document, context).flatMap(toStatements);
  const footer = [...ctx.injectFooter];
  const closing = documentClosing(document, context, footer.some(isOperations));
  return [...body, ...footer, ...closing.flatMap(toStatements)];
}
