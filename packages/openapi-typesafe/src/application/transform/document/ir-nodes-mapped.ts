/** `origin` holds the compiler node a raw type was printed from; it is not IR. */
const SKIPPED_KEYS: ReadonlySet<string> = new Set(["origin"]);

/** An IR node (or any object in one) as the mapping reads it. */
export type IrNodeRecord = Readonly<Record<string, unknown>>;

function isNode(value: unknown): value is IrNodeRecord {
  return typeof value === "object" && value !== null;
}

/**
 * `value` with every IR node in it mapped by `mapNode`, the children of a node first. A node or
 * list whose children `mapNode` left as they are stays the same object, so a walk that changes
 * nothing copies nothing.
 */
export function mappedIrNodes(value: unknown, mapNode: (node: IrNodeRecord) => unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => mappedIrNodes(item, mapNode));
    return items.some((item, index) => item !== value[index]) ? items : value;
  }
  if (!isNode(value)) {
    return value;
  }
  const entries = Object.entries(value);
  const mapped = entries.map(([key, child]) =>
    SKIPPED_KEYS.has(key) ? child : mappedIrNodes(child, mapNode),
  );
  const isChanged = mapped.some((child, index) => child !== entries[index]?.[1]);
  const node = isChanged
    ? Object.fromEntries(entries.map(([key], index) => [key, mapped[index]]))
    : value;
  return mapNode(node);
}
