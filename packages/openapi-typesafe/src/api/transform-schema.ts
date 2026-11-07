import type { ts } from "../adapters/type-ast-bridge/typescript-types.js";
import { documentBody, documentClosing } from "../application/transform/document/document.js";
import { renameTakenAliases } from "../application/transform/document/root-type-aliases.js";
import { RunFooter } from "../application/transform/footer/document-footer.js";
import { checkedEnumValues } from "../application/transform/footer/enum-values-check.js";
import {
  SharedEnumNameRecorder,
  type SharedEnumNames,
} from "../application/transform/footer/shared-enum-names.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";
import type { DocumentObject } from "../domain/openapi/document-object.js";
import { OutputFix } from "../domain/output-fixes.js";
import type { GlobalContext, OpenAPI3 } from "../types.js";
import { FirstSchemaNameRecorder } from "./discriminator-enum-names.js";
import { documentDeclarations, type TransformedDocument } from "./document-declarations.js";
import { excludedValuesWarning } from "./enum-values-warnings.js";
import { type FooterEntry, isIrDeclaration } from "./footer-entry.js";
import { ContextFooterSink } from "./footer-sink.js";
import type { RunContext } from "./run-context.js";
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

/** A shared enum name recorder of a first pass, and the names it gives the second. */
interface EnumNameRecorder extends SharedEnumNames {
  chosenNames(): SharedEnumNames;
}

/**
 * The names of shared enums, known only at the end: a first pass transforms the document into a
 * scratch footer that `recorder` watches; its output is dropped. User callbacks run in both
 * passes. The `dedupe-enum-names` fix (ADR-021, upstream #1683) names an enum by all of its
 * schemas; `discriminator-values` keeps the first declaring schema's name
 * (`FirstSchemaNameRecorder`).
 */
function sharedEnumNamesOf(
  document: DocumentObject,
  ctx: RunContext,
  recorder: EnumNameRecorder,
): SharedEnumNames {
  const injectFooter: FooterEntry[] = [];
  const scratch: RunContext = {
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

/** The recorder of the run's fixes, or null where the first schema's name needs no first pass. */
function enumNameRecorderOf(ctx: GlobalContext): EnumNameRecorder | null {
  if (ctx.fix?.includes(OutputFix.DEDUPE_ENUM_NAMES)) {
    return new SharedEnumNameRecorder();
  }
  return ctx.fix?.includes(OutputFix.DISCRIMINATOR_VALUES) ? new FirstSchemaNameRecorder() : null;
}

/** With a naming fix, `--enum` and `--dedupe-enums`, the run's footer names shared enums. */
function withSharedEnumNames(document: DocumentObject, ctx: RunContext): void {
  const recorder = ctx.runFooter === undefined ? enumNameRecorderOf(ctx) : null;
  if (recorder === null || !ctx.enum || !ctx.dedupeEnums) {
    return;
  }
  const names = sharedEnumNamesOf(document, ctx, recorder);
  ctx.runFooter = new RunFooter(new ContextFooterSink(ctx.injectFooter), true, names);
}

/**
 * With `--enum-values`, arrays whose location type does not hold their values are typed by their
 * values (ADR-027); a location that excludes listed values is a contradiction of the document.
 */
function enumValuesChecked(
  body: readonly IrDeclaration[],
  footer: FooterEntry[],
  ctx: RunContext,
): FooterEntry[] {
  if (!ctx.enumValues) {
    return footer;
  }
  const checked = checkedEnumValues(footer, body, isIrDeclaration);
  for (const retype of checked.retyped) {
    if (retype.kind === "excluded") {
      ctx.logger?.warn(excludedValuesWarning(retype.name, retype.excluded));
    }
  }
  return checked.footer;
}

/** @internal Root types, the footer, then the closing declarations (Phase 5, step 6). */
export function transformDocument(schema: OpenAPI3, ctx: RunContext): TransformedDocument {
  const document = schema as DocumentObject;
  withSharedEnumNames(document, ctx);
  const context = createTransformContext(ctx);
  // documentBody registers the enums in the footer, so the footer is read after it.
  const rawBody = documentBody(document, context, () => ctx.injectFooter.filter(isIrDeclaration));
  const footer = enumValuesChecked(rawBody, [...ctx.injectFooter], ctx);
  const closing = documentClosing(document, context, footer.some(isOperations));
  const body = renameTakenAliases(rawBody, footer.filter(isIrDeclaration), closing);
  return { body, footer, closing };
}

/**
 * The whole document as IR declarations (ENGINEERING_PLAN 6.1–6.2); `openapiTS` returns the same
 * for a loaded document.
 */
export default function transformSchema(schema: OpenAPI3, ctx: GlobalContext): IrDeclaration[] {
  return documentDeclarations(transformDocument(schema, ctx));
}
