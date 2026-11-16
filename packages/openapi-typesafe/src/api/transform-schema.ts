import type { ts } from "../adapters/type-ast-bridge/typescript-types.js";
import { documentBody, documentClosing } from "../application/transform/document/document.js";
import {
  NAMES_THE_OUTPUT_MAY_NEED,
  namesTheOutputNeeds,
  withEnumDeclarationsMerged,
  withEnumsRenamed,
} from "../application/transform/document/enum-names-given-back.js";
import { enumReferenceNarrowing } from "../application/transform/document/enum-narrowing.js";
import { operationKeysWritten } from "../application/transform/document/operation-keys-written.js";
import {
  templateKeyTypes,
  unmatchedTemplateKeys,
  withTemplatePathRefs,
} from "../application/transform/document/path-template-refs.js";
import { renameTakenAliases } from "../application/transform/document/root-type-aliases.js";
import { componentEnumNames } from "../application/transform/footer/component-enum-names.js";
import { RunFooter, type RunFooterNames } from "../application/transform/footer/document-footer.js";
import { enumGrouping } from "../application/transform/footer/enum-groups.js";
import { EnumNameClaims } from "../application/transform/footer/enum-name-claims.js";
import { EnumOwners } from "../application/transform/footer/enum-owners.js";
import { checkedEnumValues } from "../application/transform/footer/enum-values-check.js";
import { EnumValuesNames } from "../application/transform/footer/enum-values-names.js";
import { OperationKeys } from "../application/transform/footer/operation-keys.js";
import {
  BEST_SCHEMA_NAMES,
  FIRST_DECLARING_SCHEMA_NAMES,
  FIRST_SCHEMA_NAMES,
  type SharedEnumNames,
} from "../application/transform/footer/shared-enum-names.js";
import type { RawKeyTypes } from "../application/transform/footer/signature-index.js";
import type { IrDeclaration, IrEnumDeclaration } from "../domain/ir/nodes.js";
import type { DocumentObject } from "../domain/openapi/document-object.js";
import { schemaDialectOf } from "../domain/openapi/schema-dialect.js";
import { FIX } from "../domain/output-fixes.js";
import type { GlobalContext, OpenAPI3 } from "../types.js";
import { documentDeclarations, type TransformedDocument } from "./document-declarations.js";
import { excludedValuesWarning } from "./enum-values-warnings.js";
import { type FooterEntry, isIrDeclaration } from "./footer-entry.js";
import { ContextFooterSink } from "./footer-sink.js";
import { checkedPass, type PointerPass } from "./ref-pointer-passes.js";
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

/**
 * How `--dedupe-enums` names the enums it shares at the end of the run; null where the run shares
 * none. The `dedupe-enum-names` fix (ADR-021, upstream #1683) names an enum by all of its schemas;
 * `discriminator-values` keeps the first declaring schema's name.
 */
function sharedEnumNamesOf(ctx: GlobalContext): SharedEnumNames | null {
  if (!ctx.enum || !ctx.dedupeEnums) {
    return null;
  }
  if (ctx.fix?.includes(FIX.DEDUPE_ENUM_NAMES)) {
    return BEST_SCHEMA_NAMES;
  }
  return ctx.fix?.includes(FIX.DISCRIMINATOR_VALUES)
    ? FIRST_DECLARING_SCHEMA_NAMES
    : FIRST_SCHEMA_NAMES;
}

/**
 * The run's footer. It shares the `--dedupe-enums` enums at the end of the run, not as they come
 * (`RunFooter`). A footer that a call before created on the context is kept.
 */
function withRunFooter(ctx: RunContext, names: RunFooterNames): void {
  ctx.runFooter ??= new RunFooter(new ContextFooterSink(ctx.injectFooter), false, names);
}

function enumDeclarationOf(entry: FooterEntry): IrEnumDeclaration | null {
  return isIrDeclaration(entry) && entry.kind === "enum" ? entry : null;
}

function isEnumDeclaration(entry: IrEnumDeclaration | null): entry is IrEnumDeclaration {
  return entry !== null;
}

/**
 * The document with one declaration of each enum, and each enum reference typed by the values
 * its schema lists (`enumReferenceNarrowing`): every value of an enum is known only now, after
 * the owners of one enum got its final name.
 */
function withWholeEnums(parts: TransformedDocument): TransformedDocument {
  const footer = withEnumDeclarationsMerged(parts.footer, enumDeclarationOf);
  const enums = footer.map(enumDeclarationOf).filter(isEnumDeclaration);
  if (enums.length === 0) {
    return parts;
  }
  const narrowed = enumReferenceNarrowing(enums);
  return {
    body: narrowed(parts.body),
    footer: footer.map((entry) =>
      isIrDeclaration(entry) ? (narrowed([entry])[0] ?? entry) : entry,
    ),
    closing: narrowed(parts.closing),
  };
}

/**
 * The document with the enums renamed to their final names (`EnumNameClaims.finalNames`): one that
 * gave way to a name the output turned out not to need gets it back, and a number that another
 * location's name asked for moves on.
 */
function withFinalEnumNames(
  written: TransformedDocument,
  names: RunFooterNames,
  sharing: SharedEnumNames | null,
): TransformedDocument {
  const parts = {
    ...written,
    footer: withEnumDeclarationsMerged(written.footer, enumDeclarationOf),
  };
  const footer = parts.footer.filter(isIrDeclaration);
  const needed = namesTheOutputNeeds({ ...parts, footer });
  const renames = names.enums.finalNames(needed, enumGrouping(names.owners, sharing));
  if (renames.size === 0) {
    return withWholeEnums(parts);
  }
  const renamed = parts.footer.map((entry) =>
    isIrDeclaration(entry) ? (withEnumsRenamed([entry], renames)[0] ?? entry) : entry,
  );
  return withWholeEnums({
    body: withEnumsRenamed(parts.body, renames),
    footer: renamed,
    closing: withEnumsRenamed(parts.closing, renames),
  });
}

/**
 * With `--enum-values`, arrays whose location type does not hold their values are typed by their
 * values (ADR-027); a location that excludes listed values is a contradiction of the document.
 * The arrays are checked as they are written, so their locations index templated paths by the
 * template already (`withTemplateRefs`).
 */
function enumValuesChecked(
  body: readonly IrDeclaration[],
  footer: FooterEntry[],
  ctx: RunContext,
  keyTypes: RawKeyTypes,
): FooterEntry[] {
  if (!ctx.enumValues) {
    return footer;
  }
  const checked = checkedEnumValues(footer, body, isIrDeclaration, keyTypes);
  for (const retype of checked.retyped) {
    if (retype.kind === "excluded") {
      ctx.logger?.warn(excludedValuesWarning(retype.name, retype.excluded));
    }
  }
  return checked.footer;
}

/** The footer with the `--enum-values` arrays renamed to their final names. */
function withFinalEnumValuesNames(
  footer: readonly FooterEntry[],
  names: RunFooterNames,
): FooterEntry[] {
  const renames = names.enumValues.finalNames();
  return footer.map((entry) => {
    const final =
      isIrDeclaration(entry) && entry.kind === "constArray" ? renames.get(entry.name) : undefined;
    return final === undefined ? entry : { ...entry, name: final };
  });
}

/** The footer with its references into templated paths indexed by their templates. */
function withTemplateRefs(
  footer: readonly FooterEntry[],
  keys: ReadonlyMap<string, string>,
): FooterEntry[] {
  return footer.map((entry) =>
    isIrDeclaration(entry) ? (withTemplatePathRefs([entry], keys)[0] ?? entry) : entry,
  );
}

/** One pass over the document: root types, the footer, then the closing declarations. */
function transformPass(document: DocumentObject, ctx: RunContext): PointerPass {
  const names: RunFooterNames = {
    enums: new EnumNameClaims(NAMES_THE_OUTPUT_MAY_NEED, componentEnumNames(document)),
    owners: new EnumOwners(),
    enumValues: new EnumValuesNames(),
    operations: new OperationKeys(operationKeysWritten(document)),
  };
  withRunFooter(ctx, names);
  const context = createTransformContext(ctx);
  const templates = unmatchedTemplateKeys(document.paths, context);
  // documentBody registers the enums in the footer, so the footer is read after it.
  const body = documentBody(document, context, () => ctx.injectFooter.filter(isIrDeclaration));
  const rawBody = withTemplatePathRefs(body, templates);
  const keyTypes = templateKeyTypes(document.paths, context);
  const named = withFinalEnumValuesNames(ctx.injectFooter, names);
  const templated = withTemplateRefs(named, templates);
  const rawFooter = enumValuesChecked(rawBody, templated, ctx, keyTypes);
  // The closing declarations (an empty `operations`, the paths enum) index no path.
  const rawClosing = documentClosing(document, context, rawFooter.some(isOperations));
  const parts = withFinalEnumNames(
    { body: rawBody, footer: rawFooter, closing: rawClosing },
    names,
    sharedEnumNamesOf(ctx),
  );
  const footer = parts.footer.filter(isIrDeclaration);
  const renamed = { ...parts, body: renameTakenAliases(parts.body, footer, parts.closing) };
  return { parts: renamed, keyTypes, templates };
}

/**
 * @internal Root types, the footer, then the closing declarations (Phase 5, step 6). A `$ref`
 * into a schema whose pointer type does not compile is typed in place (`checkedPass`).
 */
export function transformDocument(schema: OpenAPI3, ctx: RunContext): TransformedDocument {
  const document = schema as DocumentObject;
  ctx.schemaDialect = schemaDialectOf(document.openapi);
  return checkedPass(document, ctx, (pass) => transformPass(document, pass)).parts;
}

/**
 * The whole document as IR declarations (ENGINEERING_PLAN 6.1–6.2); `openapiTS` returns the same
 * for a loaded document.
 */
export default function transformSchema(schema: OpenAPI3, ctx: GlobalContext): IrDeclaration[] {
  return documentDeclarations(transformDocument(schema, ctx));
}
