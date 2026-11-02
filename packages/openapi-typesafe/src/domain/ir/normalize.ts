import type { IrKeyword, IrType } from "./nodes.js";

/**
 * Keywords that `dedupeTypes` removes when repeated. The original (`tsDedupe`) treats these as
 * primitives; `unknown` is not one of them and is kept even when repeated.
 */
const DEDUPLICATED_KEYWORDS: ReadonlySet<IrKeyword> = new Set([
  "boolean",
  "never",
  "null",
  "number",
  "string",
  "undefined",
]);

/**
 * Remove repeated primitive keywords from a union or intersection member list, keeping the first
 * occurrence and the order. Literals, references and object types are never removed, even when
 * equal: this matches the original `tsDedupe`, which compares only node kinds of primitives.
 */
export function dedupeTypes(types: readonly IrType[]): IrType[] {
  const seenKeywords = new Set<IrKeyword>();
  const kept: IrType[] = [];
  for (const type of types) {
    if (type.kind === "keyword" && DEDUPLICATED_KEYWORDS.has(type.keyword)) {
      if (seenKeywords.has(type.keyword)) {
        continue;
      }
      seenKeywords.add(type.keyword);
    }
    kept.push(type);
  }
  return kept;
}

/**
 * The collation the original `getEntries` uses for `alphabetize`. Natural order: `a2` sorts before
 * `a10`. It is locale-based on purpose, to stay byte-compatible with the original output.
 */
const ALPHABETIZE_COLLATOR = new Intl.Collator("en-us", { numeric: true });

/**
 * Sort `[key, value]` entries by key like the original `alphabetize` option (ENGINEERING_PLAN 4.1
 * `sortMembers`). The original sorts source entries before it builds members, so transformers call
 * this on entries, not on finished IR members. The sort is stable and returns a new array.
 */
export function sortEntriesByKey<T>(entries: readonly (readonly [string, T])[]): [string, T][] {
  return entries
    .map(([key, value]): [string, T] => [key, value])
    .sort(([left], [right]) => ALPHABETIZE_COLLATOR.compare(left, right));
}
