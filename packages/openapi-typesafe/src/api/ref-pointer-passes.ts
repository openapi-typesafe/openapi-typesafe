import { withTemplatePathRefs } from "../application/transform/document/path-template-refs.js";
import type { RawKeyTypes } from "../application/transform/footer/signature-index.js";
import { TypeEvaluator } from "../application/transform/footer/type-evaluation.js";
import { RecordedPointers } from "../application/transform/ref-pointer/pointer-checks.js";
import {
  leadingSegmentsOf,
  refPointerOf,
} from "../application/transform/ref-pointer/pointer-walk.js";
import type { IrDeclaration, IrType } from "../domain/ir/nodes.js";
import type { DocumentObject } from "../domain/openapi/document-object.js";
import type { TransformedDocument } from "./document-declarations.js";
import { isIrDeclaration } from "./footer-entry.js";
import type { RunContext } from "./run-context.js";

/**
 * The `$ref`s into other schemas whose type does not compile, found by a first pass over the
 * document (ADR-026). The shape model of the document answers where it is sure; where it is not,
 * the type the pass wrote is evaluated against the types the pass generated (`TypeEvaluator`),
 * and a type the evaluator surely reads as an error (a missing member) is typed in place in the
 * run's own pass. One first pass finds them all: a pointer through the location of such a `$ref`
 * reads its type, so it is missing too, and the others read the same types in both passes.
 */

/** One pass over the document: its output, and what the evaluator needs to read it. */
export interface PointerPass {
  readonly parts: TransformedDocument;
  readonly keyTypes: RawKeyTypes;
  /** The keys of templated paths that their `$ref`s are indexed by (`withTemplatePathRefs`). */
  readonly templates: ReadonlyMap<string, string>;
}

const REF_KEY = "$ref";

/** Whether the document has a `$ref` into a schema, past a component or a path item's root. */
function hasPointerRefs(node: unknown): boolean {
  if (typeof node !== "object" || node === null) {
    return false;
  }
  const ref = (node as Record<string, unknown>)[REF_KEY];
  const pointer = typeof ref === "string" ? refPointerOf(ref) : null;
  if (pointer !== null && pointer.segments.length > leadingSegmentsOf(pointer)) {
    return true;
  }
  return Object.values(node).some(hasPointerRefs);
}

/** Drops a message: a pass before the run's own must not repeat its warnings or debug lines. */
const dropMessage = (): void => undefined;
const DROPPED_MESSAGES = { debug: dropMessage, warn: dropMessage, error: dropMessage };

/** The context of the first pass: its own footer, no messages. */
function scratchContext(ctx: RunContext, checks: RecordedPointers): RunContext {
  const { runFooter: _runFooter, ...rest } = ctx;
  return {
    ...rest,
    injectFooter: [],
    logger: DROPPED_MESSAGES,
    legacyCallbackWarnings: new Set(),
    refPointerChecks: checks,
  };
}

function passDeclarations({ body, footer, closing }: TransformedDocument): IrDeclaration[] {
  return [...body, ...footer.filter(isIrDeclaration), ...closing];
}

/** The pointer type as the output writes it: templated paths indexed by their templates. */
function asWritten(type: IrType, templates: ReadonlyMap<string, string>): IrType {
  const alias: IrDeclaration = {
    kind: "typeAlias",
    name: "T",
    isExported: false,
    type,
    comments: [],
  };
  const [written] = withTemplatePathRefs([alias], templates);
  return written?.kind === "typeAlias" ? written.type : type;
}

/** The `$ref`s of one pass whose written type surely does not compile. */
function failingRefs(pass: PointerPass, checks: RecordedPointers): string[] {
  const evaluator = new TypeEvaluator(passDeclarations(pass.parts), pass.keyTypes);
  return checks.failing(
    (type) => evaluator.evaluate(asWritten(type, pass.templates)).kind === "missing",
  );
}

/** The `$ref`s to type in place. A document without `$ref`s into schemas needs no first pass. */
export function refsTypedInPlace(
  document: DocumentObject,
  ctx: RunContext,
  transformPass: (pass: RunContext) => PointerPass,
): ReadonlySet<string> {
  if (!hasPointerRefs(document)) {
    return new Set();
  }
  const checks = new RecordedPointers(new Set());
  return new Set(failingRefs(transformPass(scratchContext(ctx, checks)), checks));
}
