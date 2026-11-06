import {
  type BaseResolver,
  type Document,
  detectSpec,
  getTypes,
  isRef,
  normalizeTypes,
  type Config as RedoclyConfig,
} from "@redocly/openapi-core";
import {
  ANCHOR_REF,
  escapePointer,
  hasRef,
  isExternalValue,
  isNamedType,
  joinPointer,
  nextTick,
  parseRef,
  propertyType,
  REF_CYCLE_MESSAGE,
  type Ref,
  type RefStack,
  type ResolvedRef,
  UNKNOWN_TYPE,
  type WalkType,
} from "./ref-resolution-steps.js";

/**
 * Redocly 1.34 resolves `$ref`s with `Promise.all` over the lookups it has started and stops at
 * the first one that fails. Lookups it starts after that (the walk of a document that was still
 * loading) are never awaited: when one of them fails too, its rejection is unhandled, and Node.js
 * ends the process on an unhandled rejection (ADR-030). Redocly 2.x has the same loop.
 *
 * This is a port of Redocly's `resolveDocument` (`lib/resolve.js`, 1.34.22, MIT) that waits for
 * every lookup and then throws the first failure. The loader runs it before Redocly lints or
 * bundles, so Redocly only resolves documents in which no lookup fails. It walks the same nodes
 * with the same types and throws the same errors: the "Self-referencing circular pointer" Error,
 * the URIError of a malformed percent escape, and the TypeError of a key such as `valueOf`.
 */

/** One walk of the documents a root reaches, with every `$ref` lookup it starts. */
class RefResolutionWalk {
  readonly #resolver: BaseResolver;
  /** Redocly's `SpecExtension` type: its values are walked like values of no known type. */
  readonly specExtension: WalkType;
  readonly #seenNodes = new Set<string>();
  readonly #lookups: Promise<void>[] = [];

  constructor(resolver: BaseResolver, specExtension: WalkType) {
    this.#resolver = resolver;
    this.specExtension = specExtension;
  }

  isWalkedLikeUnknown(type: WalkType): boolean {
    return type === UNKNOWN_TYPE || type === this.specExtension;
  }

  /** Wait for every lookup, including those started while waiting; return the first failure. */
  async settle(): Promise<PromiseRejectedResult | undefined> {
    let settled: PromiseSettledResult<void>[];
    do {
      settled = await Promise.allSettled(this.#lookups);
    } while (settled.length !== this.#lookups.length);
    return settled.find((result) => result.status === "rejected");
  }

  walkFrom(node: unknown, document: Document, pointer: string, type: WalkType): void {
    new DocumentWalk(this, document).walk(node, type, document.source.absoluteRef + pointer);
  }

  /** Whether the node was walked with this type before; marks it walked. */
  isSeen(type: WalkType, absoluteRef: string): boolean {
    const nodeId = `${type.name}::${absoluteRef}`;
    const isSeen = this.#seenNodes.has(nodeId);
    this.#seenNodes.add(nodeId);
    return isSeen;
  }

  track(lookup: Promise<ResolvedRef>, type: WalkType): void {
    this.#lookups.push(
      lookup.then((resolved) => {
        if (resolved.resolved && resolved.document !== undefined) {
          this.walkFrom(resolved.node, resolved.document, resolved.nodePointer ?? "#/", type);
        }
      }),
    );
  }

  async loadDocument(base: Document, uri: string): Promise<Document | undefined> {
    try {
      return (await this.#resolver.resolveDocument(base.source.absoluteRef, uri)) as Document;
    } catch {
      // Redocly records the failed lookup as an unresolved `$ref`; the lint reports it.
      return undefined;
    }
  }
}

/** The walk of one document from one node, with the anchors it collects (as in Redocly). */
class DocumentWalk {
  readonly #walk: RefResolutionWalk;
  readonly #document: Document;
  readonly #anchors = new Map<string, unknown>();

  constructor(walk: RefResolutionWalk, document: Document) {
    this.#walk = walk;
    this.#document = document;
  }

  walk(node: unknown, type: WalkType, absoluteRef: string): void {
    if (typeof node !== "object" || node === null || this.#walk.isSeen(type, absoluteRef)) {
      return;
    }
    const anchor = (node as { $anchor?: unknown }).$anchor;
    if (Object.hasOwn(node, "$anchor") && anchor) {
      this.#anchors.set(`#${String(anchor)}`, node);
    }
    if (Array.isArray(node)) {
      this.#walkItems(node, type, absoluteRef);
      return;
    }
    for (const name of Object.keys(node)) {
      const value = (node as Record<string, unknown>)[name];
      const [propType, walked] = propertyType(type, name, value, this.#walk.specExtension);
      if (isNamedType(propType) && typeof walked === "object") {
        this.walk(walked, propType, joinPointer(absoluteRef, escapePointer(name)));
      }
    }
    if (isRef(node)) {
      this.#walk.track(this.#follow(this.#document, node, { prev: null, node }), type);
    }
    if (isExternalValue(node)) {
      const ref = { $ref: node.externalValue };
      this.#walk.track(this.#follow(this.#document, ref, { prev: null, node }), type);
    }
  }

  #walkItems(items: readonly unknown[], type: WalkType, absoluteRef: string): void {
    const itemsType = type.items;
    if (itemsType === undefined && !this.#walk.isWalkedLikeUnknown(type)) {
      return;
    }
    items.forEach((item, index) => {
      const pointer = joinPointer(absoluteRef, index);
      const itemType = typeof itemsType === "function" ? itemsType(item, pointer) : itemsType;
      if (itemType === undefined && !this.#walk.isWalkedLikeUnknown(type)) {
        return;
      }
      this.walk(item, isNamedType(itemType) ? itemType : UNKNOWN_TYPE, pointer);
    });
  }

  async #follow(document: Document, ref: Ref, refStack: RefStack): Promise<ResolvedRef> {
    if (hasRef(refStack.prev, ref)) {
      throw new Error(REF_CYCLE_MESSAGE);
    }
    if (ANCHOR_REF.test(ref.$ref)) {
      await nextTick();
      return { resolved: true, node: this.#anchors.get(ref.$ref), document, nodePointer: ref.$ref };
    }
    const { uri, pointer } = parseRef(ref.$ref);
    const targetDocument = uri === null ? document : await this.#walk.loadDocument(document, uri);
    if (targetDocument === undefined) {
      return { resolved: false };
    }
    const found = await this.#followSegments(targetDocument, pointer, refStack);
    if (found.document !== undefined && isRef(found.node)) {
      return this.#follow(found.document, found.node, pushRef(refStack, found.node));
    }
    return found;
  }

  /** Follow the pointer segments; a `$ref` met on the way is resolved first. */
  async #followSegments(
    targetDocument: Document,
    segments: readonly string[],
    refStack: RefStack,
  ): Promise<ResolvedRef> {
    let document = targetDocument;
    let nodePointer = "#/";
    let target: unknown = targetDocument.parsed;
    for (const segment of segments) {
      if (typeof target !== "object") {
        return { resolved: true, node: undefined, document, nodePointer };
      }
      // A `null` target throws a TypeError here, as it does in Redocly.
      const step = (target as Record<string, unknown>)[segment];
      if (step !== undefined) {
        target = step;
      } else if (isRef(target)) {
        const resolved = await this.#follow(document, target, pushRef(refStack, target));
        document = resolved.document ?? document;
        if (typeof resolved.node !== "object") {
          return {
            resolved: true,
            node: undefined,
            document,
            nodePointer: resolved.nodePointer ?? nodePointer,
          };
        }
        target = (resolved.node as Record<string, unknown>)[segment];
        nodePointer = resolved.nodePointer ?? nodePointer;
      } else {
        return { resolved: true, node: undefined, document, nodePointer };
      }
      nodePointer = joinPointer(nodePointer, escapePointer(segment));
    }
    return { resolved: true, node: target, document, nodePointer };
  }
}

function pushRef(head: RefStack, node: unknown): RefStack {
  return { prev: head, node };
}

/**
 * Resolve every `$ref` the document reaches, as Redocly's lint and bundle do, and throw the first
 * failure only after all lookups have finished. Documents are loaded through the given resolver,
 * whose cache Redocly then reuses.
 */
export async function checkRefsResolve(
  document: Document,
  resolver: BaseResolver,
  styleguide: RedoclyConfig["styleguide"],
): Promise<void> {
  const specVersion = detectSpec(document.parsed);
  const types = normalizeTypes(
    styleguide.extendTypes(getTypes(specVersion), specVersion),
    styleguide,
  );
  const rootType = types.Root;
  const specExtension = types.SpecExtension;
  if (rootType === undefined || specExtension === undefined) {
    // Redocly gives every spec version both types; a missing one is a Redocly change to port.
    throw new Error(`Redocly has no Root or SpecExtension type for ${specVersion}`);
  }
  const walk = new RefResolutionWalk(resolver, specExtension);
  let rootFailure: PromiseRejectedResult | undefined;
  try {
    walk.walkFrom(document.parsed, document, "#/", rootType);
  } catch (error) {
    // The walk of the root can fail after it started lookups; they are awaited all the same.
    rootFailure = { status: "rejected", reason: error };
  }
  const lookupFailure = await walk.settle();
  const failure = rootFailure ?? lookupFailure;
  if (failure !== undefined) {
    throw failure.reason;
  }
}
