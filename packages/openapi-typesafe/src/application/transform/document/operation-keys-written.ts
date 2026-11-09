import { operationKeyOf } from "./path-item.js";

/**
 * Every `operations` key that an `operationId` in the document asks for, so that a repeated ID
 * never gets a number another operation has as its own ID (`OperationKeys`). Operations can sit
 * in `paths`, `webhooks`, `components.pathItems` and callbacks, so the whole document is read. A
 * Link Object's `operationId` is read too; an extra name only makes a number skip it.
 */
export function operationKeysWritten(document: object): Set<string> {
  const keys = new Set<string>();
  const seen = new WeakSet<object>();
  const pending: unknown[] = [document];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value !== "object" || value === null || seen.has(value)) {
      continue;
    }
    seen.add(value);
    const { operationId } = value as { operationId?: unknown };
    if (typeof operationId === "string") {
      keys.add(operationKeyOf(operationId));
    }
    pending.push(...Object.values(value));
  }
  return keys;
}
