import type { ts } from "../adapters/type-ast-bridge/typescript-types.js";
import { documentBody, documentClosing } from "../application/transform/document/document.js";
import { renameAliasesTakenByFooter } from "../application/transform/document/root-type-aliases.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";
import type { DocumentObject } from "../domain/openapi/document-object.js";
import type { GlobalContext, OpenAPI3 } from "../types.js";
import { documentDeclarations, type TransformedDocument } from "./document-declarations.js";
import { type FooterEntry, isIrDeclaration } from "./footer-entry.js";
import { createTransformContext } from "./transform-context.js";

const OPERATIONS_NAME = "operations";

/** Whether a footer entry is named `operations` (any declaration kind, as in the original). */
function isOperations(entry: FooterEntry): boolean {
  const name = isIrDeclaration(entry)
    ? (entry as { name?: string }).name
    : (entry as Partial<ts.InterfaceDeclaration>).name?.escapedText;
  return name === OPERATIONS_NAME;
}

/** @internal Root types, the footer, then the closing declarations (Phase 5, step 6). */
export function transformDocument(schema: OpenAPI3, ctx: GlobalContext): TransformedDocument {
  const document = schema as DocumentObject;
  const context = createTransformContext(ctx);
  // documentBody registers the enums in the footer, so the footer is read after it.
  const rawBody = documentBody(document, context);
  const footer: FooterEntry[] = [...ctx.injectFooter];
  const body = renameAliasesTakenByFooter(rawBody, footer.filter(isIrDeclaration));
  const closing = documentClosing(document, context, footer.some(isOperations));
  return { body, footer, closing };
}

/**
 * The whole document as IR declarations (ENGINEERING_PLAN 6.1–6.2); `openapiTS` returns the same
 * for a loaded document.
 */
export default function transformSchema(schema: OpenAPI3, ctx: GlobalContext): IrDeclaration[] {
  return documentDeclarations(transformDocument(schema, ctx));
}
