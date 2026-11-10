import type { ts } from "../adapters/type-ast-bridge/typescript-types.js";
import { documentBody, documentClosing } from "../application/transform/document/document.js";
import {
  NAMES_THE_OUTPUT_MAY_NEED,
  namesTheOutputNeeds,
  withEnumsRenamed,
} from "../application/transform/document/enum-names-given-back.js";
import { operationKeysWritten } from "../application/transform/document/operation-keys-written.js";
import {
  unmatchedTemplateKeys,
  withTemplatePathRefs,
} from "../application/transform/document/path-template-refs.js";
import { renameTakenAliases } from "../application/transform/document/root-type-aliases.js";
import { RunFooter, type RunFooterNames } from "../application/transform/footer/document-footer.js";
import { EnumNameClaims } from "../application/transform/footer/enum-name-claims.js";
import { checkedEnumValues } from "../application/transform/footer/enum-values-check.js";
import { OperationKeys } from "../application/transform/footer/operation-keys.js";
import {
  FIRST_SCHEMA_NAMES,
  SharedEnumNameRecorder,
  type SharedEnumNames,
} from "../application/transform/footer/shared-enum-names.js";
import type { IrDeclaration } from "../domain/ir/nodes.js";
import type { DocumentObject } from "../domain/openapi/document-object.js";
import { schemaDialectOf } from "../domain/openapi/schema-dialect.js";
import { FIX } from "../domain/output-fixes.js";
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
  if (ctx.fix?.includes(FIX.DEDUPE_ENUM_NAMES)) {
    return new SharedEnumNameRecorder();
  }
  return ctx.fix?.includes(FIX.DISCRIMINATOR_VALUES) ? new FirstSchemaNameRecorder() : null;
}

/**
 * The run's footer: with a naming fix, `--enum` and `--dedupe-enums` it names shared enums. A
 * footer that a call before created on the context is kept.
 */
function withRunFooter(document: DocumentObject, ctx: RunContext, names: RunFooterNames): void {
  if (ctx.runFooter !== undefined) {
    return;
  }
  const recorder = enumNameRecorderOf(ctx);
  const shared =
    recorder === null || !ctx.enum || !ctx.dedupeEnums
      ? null
      : sharedEnumNamesOf(document, ctx, recorder);
  const sink = new ContextFooterSink(ctx.injectFooter);
  ctx.runFooter =
    shared === null
      ? new RunFooter(sink, ctx.dedupeEnums, FIRST_SCHEMA_NAMES, names)
      : new RunFooter(sink, true, shared, names);
}

/**
 * The document with the enums renamed that gave way to a name the output turned out not to need
 * (`EnumNameClaims`): they get that name back, as before.
 */
function withEnumNamesGivenBack(
  parts: TransformedDocument,
  names: RunFooterNames,
): TransformedDocument {
  const footer = parts.footer.filter(isIrDeclaration);
  const renames = names.enums.givenBack(namesTheOutputNeeds({ ...parts, footer }));
  if (renames.size === 0) {
    return parts;
  }
  return {
    body: withEnumsRenamed(parts.body, renames),
    footer: parts.footer.map((entry) =>
      isIrDeclaration(entry) ? (withEnumsRenamed([entry], renames)[0] ?? entry) : entry,
    ),
    closing: withEnumsRenamed(parts.closing, renames),
  };
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

/** The document with its references into templated paths indexed by their templates. */
function withTemplateRefs(
  { body, footer, closing }: TransformedDocument,
  keys: ReadonlyMap<string, string>,
): TransformedDocument {
  return {
    body: withTemplatePathRefs(body, keys),
    footer: footer.map((entry) =>
      isIrDeclaration(entry) ? (withTemplatePathRefs([entry], keys)[0] ?? entry) : entry,
    ),
    closing: withTemplatePathRefs(closing, keys),
  };
}

/** @internal Root types, the footer, then the closing declarations (Phase 5, step 6). */
export function transformDocument(schema: OpenAPI3, ctx: RunContext): TransformedDocument {
  const document = schema as DocumentObject;
  ctx.schemaDialect = schemaDialectOf(document.openapi);
  const names: RunFooterNames = {
    enums: new EnumNameClaims(NAMES_THE_OUTPUT_MAY_NEED),
    operations: new OperationKeys(operationKeysWritten(document)),
  };
  withRunFooter(document, ctx, names);
  const context = createTransformContext(ctx);
  // documentBody registers the enums in the footer, so the footer is read after it.
  const rawBody = documentBody(document, context, () => ctx.injectFooter.filter(isIrDeclaration));
  const rawFooter = enumValuesChecked(rawBody, [...ctx.injectFooter], ctx);
  const rawClosing = documentClosing(document, context, rawFooter.some(isOperations));
  const parts = { body: rawBody, footer: rawFooter, closing: rawClosing };
  const { body, footer, closing } = withEnumNamesGivenBack(parts, names);
  const named = { body: renameTakenAliases(body, footer.filter(isIrDeclaration), closing), footer };
  return withTemplateRefs({ ...named, closing }, unmatchedTemplateKeys(document.paths, context));
}

/**
 * The whole document as IR declarations (ENGINEERING_PLAN 6.1–6.2); `openapiTS` returns the same
 * for a loaded document.
 */
export default function transformSchema(schema: OpenAPI3, ctx: GlobalContext): IrDeclaration[] {
  return documentDeclarations(transformDocument(schema, ctx));
}
