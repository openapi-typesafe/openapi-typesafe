import { withTemplatePathRefs } from "../application/transform/document/path-template-refs.js";
import { readsNever } from "../application/transform/footer/never-reads.js";
import type { RawKeyTypes } from "../application/transform/footer/signature-index.js";
import { TypeEvaluator } from "../application/transform/footer/type-evaluation.js";
import {
  type PointerRead,
  type PointersInPlace,
  RecordedPointers,
} from "../application/transform/ref-pointer/pointer-checks.js";
import {
  leadingSegmentsOf,
  refPointerOf,
} from "../application/transform/ref-pointer/pointer-walk.js";
import type { IrDeclaration, IrType } from "../domain/ir/nodes.js";
import type { DocumentObject } from "../domain/openapi/document-object.js";
import { defaultLogger } from "./default-ports.js";
import type { TransformedDocument } from "./document-declarations.js";
import { isIrDeclaration } from "./footer-entry.js";
import { HeldMessages } from "./held-messages.js";
import type { RunContext } from "./run-context.js";

/**
 * The pass of a document whose `$ref`s into other schemas compile (ADR-026). The shape model of
 * the document answers where it is sure; where it is not, the type a pass wrote is evaluated
 * against the types the pass generated (`TypeEvaluator`). The run's pass is kept where no type
 * surely reads as an error (a missing member); otherwise those `$ref`s are typed in place in one
 * more pass. That pass finds no new error: a pointer through the location of such a `$ref` reads
 * its type, so it is missing too, and the others read the same types in both passes.
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

/** Drops a message: a scratch pass must not repeat the run's warnings or debug lines. */
const dropMessage = (): void => undefined;
const DROPPED_MESSAGES = { debug: dropMessage, warn: dropMessage, error: dropMessage };

/** The context of a scratch pass: its own footer, no messages. */
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

/**
 * The `$ref`s of one pass whose written type surely does not compile, or surely has no value
 * (`never`, read through a `Record<string, never>` or an owner that has no value).
 */
function refsInPlace(pass: PointerPass, checks: RecordedPointers): PointersInPlace {
  const evaluator = new TypeEvaluator(passDeclarations(pass.parts), pass.keyTypes);
  return checks.checked((type): PointerRead => {
    const read = evaluator.evaluate(asWritten(type, pass.templates));
    if (read.kind !== "type") {
      return read.kind === "missing" ? "missing" : "other";
    }
    return readsNever(evaluator, read) ? "never" : "other";
  });
}

function isEmpty(inPlace: PointersInPlace): boolean {
  return inPlace.missing.size === 0 && inPlace.never.size === 0;
}

type Transform = (pass: RunContext) => PointerPass;

/**
 * The `$ref`s to type in place, from a scratch pass: the run's context already has a footer, of
 * an earlier call on it, which a pass of the run's own would change before it may be dropped.
 */
function refsInPlaceOfScratch(ctx: RunContext, transform: Transform): PointersInPlace {
  const checks = new RecordedPointers();
  return refsInPlace(transform(scratchContext(ctx, checks)), checks);
}

/**
 * The run's own pass with its messages held. It is kept where every pointer type may compile;
 * otherwise its footer entries are dropped and the `$ref`s found are typed in place.
 */
function keptOrRedone(ctx: RunContext, transform: Transform): PointerPass {
  const checks = new RecordedPointers();
  const messages = new HeldMessages();
  const footerLength = ctx.injectFooter.length;
  // Shared with the pass, so a deprecated callback form is reported once over both passes.
  ctx.legacyCallbackWarnings ??= new Set();
  const own: RunContext = { ...ctx, logger: messages, refPointerChecks: checks };
  const pass = transform(own);
  const inPlace = refsInPlace(pass, checks);
  if (isEmpty(inPlace)) {
    // A pass always creates its footer (`withRunFooter`); the guard is for the optional type.
    if (own.runFooter !== undefined) {
      ctx.runFooter = own.runFooter;
    }
    messages.writeTo(ctx.logger ?? defaultLogger(ctx.silent));
    return pass;
  }
  ctx.injectFooter.length = footerLength;
  ctx.refPointerChecks = new RecordedPointers(inPlace);
  return transform(ctx);
}

/** The pass of the document, with `$ref`s whose pointer type does not compile typed in place. */
export function checkedPass(
  document: DocumentObject,
  ctx: RunContext,
  transform: Transform,
): PointerPass {
  if (!hasPointerRefs(document)) {
    return transform(ctx);
  }
  if (ctx.runFooter === undefined) {
    return keptOrRedone(ctx, transform);
  }
  ctx.refPointerChecks = new RecordedPointers(refsInPlaceOfScratch(ctx, transform));
  return transform(ctx);
}
