import type ts from "typescript";
import { toStatements } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import { documentBody, documentClosing } from "../application/transform/document/document.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";
import type { DocumentObject } from "../domain/openapi/document-object.js";
import { createTransformContext } from "../lib/transform-context.js";
import type { GlobalContext, OpenAPI3 } from "../types.js";

const OPERATIONS_NAME = "operations";

/**
 * The document in three parts. The footer stays a `ts.Node` list until Phase 6, because user
 * callbacks may add their own nodes to it.
 */
export interface TransformedDocument {
  readonly body: readonly IrDeclaration[];
  readonly footer: readonly ts.Node[];
  readonly closing: readonly IrDeclaration[];
}

/** Whether a footer node is named `operations` (the generator's interface, or a user's node). */
function isOperations(node: ts.Node): boolean {
  return (node as ts.InterfaceDeclaration)?.name?.escapedText === OPERATIONS_NAME;
}

/** @internal Root types, the footer, then the closing declarations (Phase 5, step 6). */
export function transformDocument(schema: OpenAPI3, ctx: GlobalContext): TransformedDocument {
  const document = schema as DocumentObject;
  const context = createTransformContext(ctx);
  const body = documentBody(document, context);
  const footer = [...ctx.injectFooter];
  const closing = documentClosing(document, context, footer.some(isOperations));
  return { body, footer, closing };
}

/** The whole document as `ts.Node`s, as the Node API returns it until Phase 6. */
export default function transformSchema(schema: OpenAPI3, ctx: GlobalContext): ts.Node[] {
  const { body, footer, closing } = transformDocument(schema, ctx);
  return [...body.flatMap(toStatements), ...footer, ...closing.flatMap(toStatements)];
}
