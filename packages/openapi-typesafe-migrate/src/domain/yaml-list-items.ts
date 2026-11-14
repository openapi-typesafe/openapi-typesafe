import type { DocumentString } from "./config-documents.js";

const NAME_KEY = "name";

/** The `name` of the list item that `strings[index]` is the `value` of, or undefined. */
export function itemName(strings: readonly DocumentString[], index: number): string | undefined {
  const item = strings[index]?.path.slice(0, -1) ?? [];
  const isInItem = (string: DocumentString | undefined): boolean =>
    string !== undefined && item.every((part, at) => string.path[at] === part);
  const isName = (string: DocumentString): boolean =>
    string.path.length === item.length + 1 && string.path.at(-1) === NAME_KEY;
  let [first, last] = [index, index];
  while (isInItem(strings[first - 1])) {
    first -= 1;
  }
  while (isInItem(strings[last + 1])) {
    last += 1;
  }
  return strings.slice(first, last + 1).find(isName)?.value;
}
