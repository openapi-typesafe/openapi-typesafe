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
import type { FactoryNames } from "./factory-type-text.js";
import { createFileBindings } from "./file-bindings.js";
import { type GeneratorCall, generatorCalls } from "./generator-calls.js";
import { plainScriptKind } from "./script-regions.js";
import { returnEdits, returnedExpressions } from "./transform-returns.js";
import { removalEdits, unusedDeclarations } from "./unused-declarations.js";

/**
 * The CallbackRewriter port on the TypeScript 6 parser (ADR-015). In each `openapiTS(source, {…})`
 * call where `transform` is the only callback and every value it returns builds a type with
 * `ts.factory` or the helpers, the returns become TypeScript type text and `irCallbacks: true` is
 * added; the module-level constants and imports that only the old returns used are removed. Every
 * other legacy callback is reported, not changed: it still works, with a warning.
 */

const TRANSFORM = "transform";
const LEGACY_ONLY_CALLBACKS = ["postTransform", "transformProperty"] as const;
const IR_CALLBACKS_OPTION = "irCallbacks";

interface CallFindings {
  readonly edits: TextEdit[];
  readonly changes: Change[];
  readonly manualSteps: ManualStep[];
}

function propertyNamed(
  options: ts.ObjectLiteralExpression,
  name: string,
): ts.ObjectLiteralElementLike | undefined {
  return options.properties.find((property) => {
    const key = property.name;
    return (
      key !== undefined && (ts.isIdentifier(key) || ts.isStringLiteral(key)) && key.text === name
    );
  });
}

/** The function a `const` or a function declaration of this file holds. */
function namedFunction(
  name: ts.Identifier,
  names: FactoryNames,
): ts.FunctionLikeDeclaration | undefined {
  const binding = names.bindings.bindingOf(name);
  if (binding?.kind === "function") {
    return binding.declaration;
  }
  const value = binding?.kind === "constant" ? binding.initializer : undefined;
  return value !== undefined && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
    ? value
    : undefined;
}

/**
 * The function a `transform` property holds: a method, an arrow function or a function, inline or
 * by the name of a module-level function.
 */
function callbackFunction(
  property: ts.ObjectLiteralElementLike,
  names: FactoryNames,
): ts.FunctionLikeDeclaration | undefined {
  if (ts.isMethodDeclaration(property)) {
    return property;
  }
  if (!ts.isPropertyAssignment(property)) {
    return undefined;
  }
  const value = property.initializer;
  if (ts.isIdentifier(value)) {
    return namedFunction(value, names);
  }
  return ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? value : undefined;
}

/**
 * A function named by `transform` is rewritten only when this is its only use: other callers
 * would get type text where they expect nodes.
 */
function isSharedFunction(property: ts.ObjectLiteralElementLike, names: FactoryNames): boolean {
  if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.initializer)) {
    return false;
  }
  const declaration = names.bindings.declarationOf(property.initializer);
  return declaration !== undefined && names.bindings.usesOf(declaration).length > 1;
}

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
  const edits = returnTypeEdits(callback, text);
  for (const returned of returnedExpressions(callback.body)) {
    const returnEditList = returnEdits(returned, names);
    if (returnEditList === undefined) {
      return "unknown-return";
    }
    edits.push(...returnEditList);
  }
  return edits;
}

/**
 * The `irCallbacks: true` option, placed before `transform`: on its own line with the same
 * indentation when `transform` starts a line, else on the same line.
 */
function irCallbacksOption(text: string, transformStart: number): string {
  const lineStart = text.lastIndexOf("\n", transformStart - 1) + 1;
  const before = text.slice(lineStart, transformStart);
  const option = `${IR_CALLBACKS_OPTION}: true,`;
  return /^\s*$/.test(before) ? `${option}\n${before}` : `${option} `;
}

function keepReason(options: ts.ObjectLiteralExpression): TransformKeepReason | undefined {
  const hasOther = LEGACY_ONLY_CALLBACKS.some((name) => propertyNamed(options, name) !== undefined);
  return hasOther ? "other-callbacks" : undefined;
}

function legacyCallbackSteps(options: ts.ObjectLiteralExpression, text: string): ManualStep[] {
  return LEGACY_ONLY_CALLBACKS.flatMap((callback) => {
    const property = propertyNamed(options, callback);
    return property === undefined
      ? []
      : [{ kind: "legacy-callback" as const, line: lineAt(text, property.getStart()), callback }];
  });
}

/** The findings of one `openapiTS(source, options)` call with an options object literal. */
function migrateOptions(
  options: ts.ObjectLiteralExpression,
  text: string,
  names: FactoryNames,
): CallFindings {
  // With irCallbacks set, the callbacks already use the IR form: nothing to migrate.
  if (propertyNamed(options, IR_CALLBACKS_OPTION) !== undefined) {
    return { edits: [], changes: [], manualSteps: [] };
  }
  const findings: CallFindings = {
    edits: [],
    changes: [],
    manualSteps: legacyCallbackSteps(options, text),
  };
  const transform = propertyNamed(options, TRANSFORM);
  if (transform === undefined) {
    return findings;
  }
  const start = transform.getStart();
  const line = lineAt(text, start);
  const result = keepReason(options) ?? transformEdits(transform, names, text);
  if (typeof result === "string") {
    findings.manualSteps.push({ kind: "transform-not-rewritten", line, reason: result });
    return findings;
  }
  findings.edits.push({ start, end: start, text: irCallbacksOption(text, start) }, ...result);
  findings.changes.push({ kind: "transform-rewritten", line });
  return findings;
}

/** Options that other code uses too: the callbacks are reported, never changed. */
function sharedOptionsFindings(options: ts.ObjectLiteralExpression, text: string): CallFindings {
  const findings: CallFindings = { edits: [], changes: [], manualSteps: [] };
  if (propertyNamed(options, IR_CALLBACKS_OPTION) !== undefined) {
    return findings;
  }
  findings.manualSteps.push(...legacyCallbackSteps(options, text));
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
      return { edits: [], changes: [], manualSteps: [] };
    case "own":
      return migrateOptions(options.options, text, names);
    case "shared":
      return sharedOptionsFindings(options.options, text);
    case "unknown": {
      const line = lineAt(text, options.expression.getStart());
      return { edits: [], changes: [], manualSteps: [{ kind: "options-not-inspected", line }] };
    }
  }
}

/** The findings of every generator call; options that several calls share are read once. */
function findCallFindings(file: ts.SourceFile, text: string, names: FactoryNames): CallFindings {
  const all: CallFindings = { edits: [], changes: [], manualSteps: [] };
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
  }
  return all;
}

/** The rewrite of a file that calls the generator, with the declarations it leaves unused. */
function rewriteFile(file: ts.SourceFile, names: FactoryNames): FileMigration {
  const text = file.text;
  const { edits, changes, manualSteps } = findCallFindings(file, text, names);
  const removed = unusedDeclarations(names, edits);
  for (const found of removed) {
    changes.push({
      kind: "declaration-removed",
      line: lineAt(text, found.node.getStart()),
      name: found.name,
    });
  }
  const allEdits = [...edits, ...removalEdits(removed, text)];
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
