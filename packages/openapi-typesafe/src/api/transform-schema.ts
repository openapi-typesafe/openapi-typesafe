import type { ts } from "../adapters/type-ast-bridge/typescript-types.js";
import { documentBody, documentClosing } from "../application/transform/document/document.js";
import { renameAliasesTakenByFooter } from "../application/transform/document/root-type-aliases.js";
import { RunFooter } from "../application/transform/footer/document-footer.js";
import {
  SharedEnumNameRecorder,
  type SharedEnumNames,
} from "../application/transform/footer/shared-enum-names.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";
import type { DocumentObject } from "../domain/openapi/document-object.js";
import { OutputFix } from "../domain/output-fixes.js";
import type { GlobalContext, OpenAPI3 } from "../types.js";
import { documentDeclarations, type TransformedDocument } from "./document-declarations.js";
import { type FooterEntry, isIrDeclaration } from "./footer-entry.js";
import { ContextFooterSink } from "./footer-sink.js";
import { createTransformContext } from "./transform-context.js";

const OPERATIONS_NAME = "operations";

/** Whether a footer entry is named `operations` (any declaration kind, as in the original). */
function isOperations(entry: FooterEntry): boolean {
  const name = isIrDeclaration(entry)
    ? (entry as { name?: string }).name
    : (entry as Partial<ts.InterfaceDeclaration>).name?.escapedText;
  return name === OPERATIONS_NAME;
}

/** Drops a message: the first pass must not repeat the run's warnings or debug lines. */
const dropMessage = (): void => undefined;
const DROPPED_MESSAGES = { debug: dropMessage, warn: dropMessage, error: dropMessage };

/**
 * The `dedupe-enum-names` fix (ADR-021, upstream #1683) names a shared enum by all of its schemas,
 * which are known only at the end. So a first pass transforms the document into a scratch footer
 * and records them; its output is dropped. User callbacks run in both passes.
 */
function sharedEnumNamesOf(document: DocumentObject, ctx: GlobalContext): SharedEnumNames {
  const recorder = new SharedEnumNameRecorder();
  const injectFooter: FooterEntry[] = [];
  const scratch: GlobalContext = {
    ...ctx,
    injectFooter,
    runFooter: new RunFooter(new ContextFooterSink(injectFooter), true, recorder),
    logger: DROPPED_MESSAGES,
    legacyCallbackWarnings: new Set(),
  };
  const scratchContext = createTransformContext(scratch);
  documentBody(document, scratchContext, () => injectFooter.filter(isIrDeclaration));
  return recorder.chosenNames();
}

/** With the fix, `--enum` and `--dedupe-enums`, the run's footer names shared enums stably. */
function withSharedEnumNames(document: DocumentObject, ctx: GlobalContext): void {
  const isFixed = ctx.fix?.includes(OutputFix.DEDUPE_ENUM_NAMES) === true;
  if (ctx.runFooter !== undefined || !isFixed || !ctx.enum || !ctx.dedupeEnums) {
    return;
  }
  const names = sharedEnumNamesOf(document, ctx);
  ctx.runFooter = new RunFooter(new ContextFooterSink(ctx.injectFooter), true, names);
}

/** @internal Root types, the footer, then the closing declarations (Phase 5, step 6). */
export function transformDocument(schema: OpenAPI3, ctx: GlobalContext): TransformedDocument {
  const document = schema as DocumentObject;
  withSharedEnumNames(document, ctx);
  const context = createTransformContext(ctx);
  // documentBody registers the enums in the footer, so the footer is read after it.
  const rawBody = documentBody(document, context, () => ctx.injectFooter.filter(isIrDeclaration));
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
