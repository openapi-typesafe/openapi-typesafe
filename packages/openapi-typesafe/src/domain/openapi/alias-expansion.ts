/**
 * YAML aliases (`*name`) make the parsed document share objects. A "billion laughs" document,
 * where each level refers to the previous one ten times, parses into a few hundred objects that
 * every walk over the document (Redocly's resolver, the generator) visits as 10^9 nodes: the run
 * took minutes and ended with "RangeError: Set maximum size exceeded" (pre-beta test plan 10.2).
 * A document is refused when its aliases expand it far beyond what it stores.
 */

/** Expansion below this many nodes is allowed whatever the ratio: large real documents pass. */
export const ALIAS_EXPANSION_MIN_NODES = 1_000_000;
/** Real documents reuse anchors a few times; a bomb multiplies its size by orders of magnitude. */
export const ALIAS_EXPANSION_MAX_RATIO = 100;

export interface NodeCounts {
  /** Nodes of the document as written: each object once, with its entries. */
  readonly stored: number;
  /** Nodes a walk visits when it follows every shared object again. */
  readonly expanded: number;
}

function childrenOf(node: object): unknown[] {
  return Array.isArray(node) ? node : Object.values(node);
}

function isContainer(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** The expanded size of `node`, whose container children are all sized (or in a cycle). */
function sizeOf(node: object, sizes: ReadonlyMap<object, number>): number {
  return childrenOf(node).reduce<number>(
    (total, child) => total + (isContainer(child) ? (sizes.get(child) ?? 1) : 1),
    1,
  );
}

/**
 * Count stored and expanded nodes without recursion (documents can be thousands of levels deep)
 * and without expanding: each shared object is sized once. A cycle counts its back edge once.
 */
export function countNodes(root: unknown): NodeCounts {
  if (!isContainer(root)) {
    return { stored: 1, expanded: 1 };
  }
  const sizes = new Map<object, number>();
  const entered = new Set<object>();
  const stack: object[] = [root];
  while (stack.length > 0) {
    const node = stack[stack.length - 1] as object;
    const isFirstVisit = !entered.has(node);
    entered.add(node);
    const pending = isFirstVisit
      ? childrenOf(node).filter((child) => isContainer(child) && !entered.has(child))
      : [];
    if (pending.length > 0) {
      // One push per child: spreading an array of millions of children overflows the stack.
      for (const child of pending as object[]) {
        stack.push(child);
      }
      continue;
    }
    stack.pop();
    sizes.set(node, sizeOf(node, sizes));
  }
  let stored = 0;
  for (const node of sizes.keys()) {
    stored += 1 + childrenOf(node).filter((child) => !isContainer(child)).length;
  }
  return { stored, expanded: sizes.get(root) ?? 1 };
}

/** Whether the aliases of a parsed document expand it beyond the limits above. */
export function isAliasExpansionExcessive({ stored, expanded }: NodeCounts): boolean {
  return expanded > Math.max(ALIAS_EXPANSION_MIN_NODES, stored * ALIAS_EXPANSION_MAX_RATIO);
}
