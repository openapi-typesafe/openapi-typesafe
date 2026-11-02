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
import { collectFileNames, type FileNames } from "./file-names.js";
import { returnEdits, returnedExpressions, type TextEdit } from "./transform-returns.js";

/**
 * The CallbackRewriter port on the TypeScript 6 parser (ADR-015). In each `openapiTS(source, {…})`
 * call where `transform` is the only callback and every value it returns builds a type with
 * `ts.factory` or the helpers, the returns become TypeScript type text and `irCallbacks: true` is
 * added. Every other legacy callback is reported, not changed: it still works, with a warning.
 */

const TRANSFORM = "transform";
const LEGACY_ONLY_CALLBACKS = ["postTransform", "transformProperty"] as const;
const IR_CALLBACKS_OPTION = "irCallbacks";

interface CallFindings {
  readonly edits: TextEdit[];
  readonly changes: Change[];
  readonly manualSteps: ManualStep[];
}

const SCRIPT_KINDS: ReadonlyMap<string, ts.ScriptKind> = new Map([
  [".ts", ts.ScriptKind.TS],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
  [".js", ts.ScriptKind.JS],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
]);

/** Single-file components (`.vue`, `.svelte`, `.astro`) are not plain scripts; they are left. */
function scriptKindOf(path: string): ts.ScriptKind | undefined {
  return SCRIPT_KINDS.get(path.slice(path.lastIndexOf(".")));
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

/**
 * The function a `transform` property holds: a method, an arrow function or a function, inline or
 * by the name of a module-level function.
 */
function callbackFunction(
  property: ts.ObjectLiteralElementLike,
  names: FileNames,
): ts.FunctionLikeDeclaration | undefined {
  if (ts.isMethodDeclaration(property)) {
    return property;
  }
  if (!ts.isPropertyAssignment(property)) {
    return undefined;
  }
  const value = property.initializer;
  if (ts.isIdentifier(value)) {
    return names.functions.get(value.text);
  }
  return ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? value : undefined;
}

/**
 * A function named by `transform` is rewritten only when its name appears just twice in the file
 * (where it is defined, and here): other callers would get type text where they expect nodes.
 */
function isSharedFunction(property: ts.ObjectLiteralElementLike, text: string): boolean {
  if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.initializer)) {
    return false;
  }
  const name = property.initializer.text.replaceAll("$", "\\$");
  const uses = text.match(new RegExp(`(?<![\\w$])${name}(?![\\w$])`, "g")) ?? [];
  return uses.length > 2;
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
  names: FileNames,
  text: string,
): TextEdit[] | TransformKeepReason {
  const callback = callbackFunction(property, names);
  if (callback?.body === undefined) {
    return "not-a-function";
  }
  if (isSharedFunction(property, text)) {
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
  names: FileNames,
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

/** The options object of a generator call, if it is written in place. */
function generatorOptions(node: ts.Node, names: FileNames): ts.ObjectLiteralExpression | undefined {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
    return undefined;
  }
  const options = node.arguments[1];
  const isGenerator = names.generatorFunctions.has(node.expression.text);
  return isGenerator && options !== undefined && ts.isObjectLiteralExpression(options)
    ? options
    : undefined;
}

/** Apply edits from the end of the text, so earlier offsets stay valid. */
function applyEdits(text: string, edits: readonly TextEdit[]): string {
  return [...edits]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      text,
    );
}

function findCallFindings(file: ts.SourceFile, text: string, names: FileNames): CallFindings {
  const all: CallFindings = { edits: [], changes: [], manualSteps: [] };
  const visit = (node: ts.Node): void => {
    const options = generatorOptions(node, names);
    if (options !== undefined) {
      const found = migrateOptions(options, text, names);
      all.edits.push(...found.edits);
      all.changes.push(...found.changes);
      all.manualSteps.push(...found.manualSteps);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return all;
}

class TypescriptCallbackRewriter implements CallbackRewriter {
  rewrite(text: string, path: string): FileMigration {
    const scriptKind = scriptKindOf(path);
    if (scriptKind === undefined) {
      return unchanged(text);
    }
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind);
    const names = collectFileNames(file);
    if (names.generatorFunctions.size === 0) {
      return unchanged(text);
    }
    const { edits, changes, manualSteps } = findCallFindings(file, text, names);
    return { text: applyEdits(text, edits), changes, manualSteps };
  }
}

/** A callback rewriter that parses each file with the TypeScript 6 parser. */
export function createTypescriptCallbackRewriter(): CallbackRewriter {
  return new TypescriptCallbackRewriter();
}
