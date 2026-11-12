import ts from "@typescript/typescript6";
import type { CallbackRewriter } from "../../application/ports.js";
import {
  type Change,
  type FileMigration,
  lineAt,
  type ManualStep,
  type TransformKeepReason,
  unchanged,
} from "../../domain/migration-findings.js";
import { applyTextEdits, type TextEdit } from "../../domain/text-edits.js";
import { callbackTypeEdits } from "./declared-types.js";
import type { FactoryNames } from "./factory-type-text.js";
import { createFileBindings, type FileBindings } from "./file-bindings.js";
import { type GeneratorCall, type GeneratorOptions, generatorCalls } from "./generator-calls.js";
import {
  IR_CALLBACKS_OPTION,
  LEGACY_ONLY_CALLBACKS,
  legacyCallbackSteps,
  propertyNamed,
  TRANSFORM,
} from "./option-properties.js";
import { optionsTypeEdits, optionsTypeReferences } from "./options-type.js";
import { plainScriptKind } from "./script-regions.js";
import { spreadSteps } from "./spread-options.js";
import { callbackAnnotations, callbackFunction, isSharedFunction } from "./transform-callback.js";
import { returnEdits, returnedExpressions } from "./transform-returns.js";
import { removalEdits, unusedDeclarations } from "./unused-declarations.js";

/**
 * The CallbackRewriter port on the TypeScript 6 parser (ADR-015). In each `openapiTS(source, {…})`
 * call where `transform` is the only callback and every value it returns builds a type with
 * `ts.factory` or the helpers, the returns become TypeScript type text and `irCallbacks: true` is
 * added; the module-level constants and imports that only the old returns used are removed. Every
 * other legacy callback is reported, not changed: it still works, with a warning.
 */

/** The value of `irCallbacks` in an object that the call types: the literal `true` stays `true`. */
const IR_CALLBACKS_TRUE = "true";
/** In an untyped `const`, `true` widens to `boolean`, which no signature of `openapiTS` takes. */
const IR_CALLBACKS_TRUE_CONST = "true as const";
/** The same assertion in a JavaScript file, where `as const` is not syntax. */
const IR_CALLBACKS_TRUE_CONST_JS = "/** @type {const} */ (true)";

interface CallFindings {
  readonly edits: TextEdit[];
  readonly changes: Change[];
  readonly manualSteps: ManualStep[];
  /** The `OpenAPITSOptions` names of rewritten options, retargeted once per file. */
  readonly typeReferences: ts.Identifier[];
}

type OwnOptions = Extract<GeneratorOptions, { kind: "own" }>;

const noFindings = (): CallFindings => ({
  edits: [],
  changes: [],
  manualSteps: [],
  typeReferences: [],
});

/**
 * A declared return type names TypeScript nodes (`ts.TypeNode`), which type text does not match,
 * so it is removed and the type is inferred from the new returns.
 */
function returnTypeEdits(callback: ts.FunctionLikeDeclaration, text: string): TextEdit[] {
  const type = callback.type;
  if (type === undefined) {
    return [];
  }
  const colon = text.lastIndexOf(":", type.getStart());
  return [{ start: colon, end: type.getEnd(), text: "" }];
}

/** The edits for the returns of `transform`, or the reason to keep it. */
function transformEdits(
  property: ts.ObjectLiteralElementLike,
  names: FactoryNames,
  text: string,
): TextEdit[] | TransformKeepReason {
  const callback = callbackFunction(property, names);
  if (callback?.body === undefined) {
    return "not-a-function";
  }
  if (isSharedFunction(property, names)) {
    return "shared-function";
  }
  const declared = callbackTypeEdits(
    callbackAnnotations(property, names),
    callback,
    names.bindings,
  );
  if (declared === undefined) {
    return "declared-type";
  }
  const edits = [...returnTypeEdits(callback, text), ...declared];
  for (const returned of returnedExpressions(callback.body)) {
    const returnEditList = returnEdits(returned, names);
    if (returnEditList === undefined) {
      return "unknown-return";
    }
    edits.push(...returnEditList);
  }
  return edits;
}

/** The value of the added `irCallbacks`, which must keep the type `true` (TS2769 otherwise). */
function irCallbacksValue(options: OwnOptions): string {
  if (options.isContextuallyTyped) {
    return IR_CALLBACKS_TRUE;
  }
  const isJavaScript = (options.options.flags & ts.NodeFlags.JavaScriptFile) !== 0;
  return isJavaScript ? IR_CALLBACKS_TRUE_CONST_JS : IR_CALLBACKS_TRUE_CONST;
}

/**
 * The `irCallbacks` option, placed before `transform`: on its own line with the same
 * indentation when `transform` starts a line, else on the same line.
 */
function irCallbacksOption(text: string, transformStart: number, value: string): string {
  const lineStart = text.lastIndexOf("\n", transformStart - 1) + 1;
  const before = text.slice(lineStart, transformStart);
  const option = `${IR_CALLBACKS_OPTION}: ${value},`;
  return /^\s*$/.test(before) ? `${option}\n${before}` : `${option} `;
}

/**
 * Why the options keep their `transform`, or undefined. A spread (`...base`) may bring callbacks
 * that need TypeScript nodes, `irCallbacks`, or a type of `OpenAPITSOptions` that the IR return
 * does not fit, and the tool cannot see them.
 */
function keepReason(options: ts.ObjectLiteralExpression): TransformKeepReason | undefined {
  const hasOther = LEGACY_ONLY_CALLBACKS.some((name) => propertyNamed(options, name) !== undefined);
  if (hasOther) {
    return "other-callbacks";
  }
  return options.properties.some(ts.isSpreadAssignment) ? "spread-options" : undefined;
}

/** The rewrite of `transform` with the options types to retarget, or the reason to keep it. */
function transformRewrite(
  transform: ts.ObjectLiteralElementLike,
  options: OwnOptions,
  names: FactoryNames,
  text: string,
) {
  const edits = keepReason(options.options) ?? transformEdits(transform, names, text);
  if (typeof edits === "string") {
    return edits;
  }
  const annotations = [...options.annotations, ...callbackAnnotations(transform, names)];
  const typeReferences = optionsTypeReferences(annotations, names.bindings);
  return typeReferences === undefined ? "typed-options" : { edits, typeReferences };
}

/** The findings of one `openapiTS(source, options)` call with an options object literal. */
function migrateOptions(options: OwnOptions, text: string, names: FactoryNames): CallFindings {
  // With irCallbacks set, the callbacks already use the IR form: nothing to migrate.
  if (propertyNamed(options.options, IR_CALLBACKS_OPTION) !== undefined) {
    return noFindings();
  }
  const findings = noFindings();
  findings.manualSteps.push(...legacyCallbackSteps(options.options, text));
  findings.manualSteps.push(...spreadSteps(options.options, text, names.bindings));
  const transform = propertyNamed(options.options, TRANSFORM);
  if (transform === undefined) {
    return findings;
  }
  const start = transform.getStart();
  const line = lineAt(text, start);
  const result = transformRewrite(transform, options, names, text);
  if (typeof result === "string") {
    findings.manualSteps.push({ kind: "transform-not-rewritten", line, reason: result });
    return findings;
  }
  // Before the JSDoc of `transform`, which documents (and in JavaScript types) `transform`.
  const at = transform.getStart(undefined, true);
  const option = irCallbacksOption(text, at, irCallbacksValue(options));
  findings.edits.push({ start: at, end: at, text: option }, ...result.edits);
  findings.typeReferences.push(...result.typeReferences);
  findings.changes.push({ kind: "transform-rewritten", line });
  return findings;
}

/** Options that other code uses too: the callbacks are reported, never changed. */
function sharedOptionsFindings(
  options: ts.ObjectLiteralExpression,
  text: string,
  bindings: FileBindings,
): CallFindings {
  const findings = noFindings();
  if (propertyNamed(options, IR_CALLBACKS_OPTION) !== undefined) {
    return findings;
  }
  findings.manualSteps.push(...legacyCallbackSteps(options, text));
  findings.manualSteps.push(...spreadSteps(options, text, bindings));
  const transform = propertyNamed(options, TRANSFORM);
  if (transform !== undefined) {
    const line = lineAt(text, transform.getStart());
    findings.manualSteps.push({ kind: "transform-not-rewritten", line, reason: "shared-options" });
  }
  return findings;
}

function callFindings(found: GeneratorCall, text: string, names: FactoryNames): CallFindings {
  const options = found.options;
  switch (options?.kind) {
    case undefined:
      return noFindings();
    case "own":
      return migrateOptions(options, text, names);
    case "shared":
      return sharedOptionsFindings(options.options, text, names.bindings);
    case "unknown": {
      const line = lineAt(text, options.expression.getStart());
      return { ...noFindings(), manualSteps: [{ kind: "options-not-inspected", line }] };
    }
  }
}

/** The findings of every generator call; options that several calls share are read once. */
function findCallFindings(file: ts.SourceFile, text: string, names: FactoryNames): CallFindings {
  const all = noFindings();
  const seen = new Set<ts.Node>();
  for (const found of generatorCalls(file, names.bindings)) {
    const options = found.options?.kind === "unknown" ? undefined : found.options?.options;
    if (options !== undefined && seen.has(options)) {
      continue;
    }
    if (options !== undefined) {
      seen.add(options);
    }
    const findings = callFindings(found, text, names);
    all.edits.push(...findings.edits);
    all.changes.push(...findings.changes);
    all.manualSteps.push(...findings.manualSteps);
    all.typeReferences.push(...findings.typeReferences);
  }
  return all;
}

/** The rewrite of a file that calls the generator, with the declarations it leaves unused. */
function rewriteFile(file: ts.SourceFile, names: FactoryNames): FileMigration {
  const text = file.text;
  const { edits, changes, manualSteps, typeReferences } = findCallFindings(file, text, names);
  // The options type edits rename uses of an import, which leaves it in use, not unused.
  const removed = unusedDeclarations(names, edits);
  for (const found of removed) {
    changes.push({
      kind: "declaration-removed",
      line: lineAt(text, found.node.getStart()),
      name: found.name,
    });
  }
  const typeEdits = optionsTypeEdits(typeReferences, names.bindings);
  const allEdits = [...edits, ...typeEdits, ...removalEdits(removed, text)];
  return { text: applyTextEdits(text, allEdits), changes, manualSteps };
}

class TypescriptCallbackRewriter implements CallbackRewriter {
  rewrite(text: string, path: string): FileMigration {
    // Single-file components (`.vue`, `.svelte`, `.astro`) are not plain scripts; they are left.
    const scriptKind = plainScriptKind(path);
    if (scriptKind === undefined) {
      return unchanged(text);
    }
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind);
    const bindings = createFileBindings(file);
    if (!bindings.hasGenerator) {
      return unchanged(text);
    }
    return rewriteFile(file, { bindings, following: new Set() });
  }
}

/** A callback rewriter that parses each file with the TypeScript 6 parser. */
export function createTypescriptCallbackRewriter(): CallbackRewriter {
  return new TypescriptCallbackRewriter();
}
