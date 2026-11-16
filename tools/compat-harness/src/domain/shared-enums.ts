/**
 * With `--dedupe-enums` the golden generator gave a schema the enum of another schema whose values
 * print alike, so a property of the strings `"1" | "2"` took an enum of the numbers `1 | 2` (RC5
 * G1). The current generator declares an enum of the property's own values and points the property
 * at it, which changes types of output that compiles.
 */

import { type EnumBlock, enumBlocks, wholeNameReference } from "./enum-declarations.ts";

function withoutBlocks(lines: readonly string[], blocks: readonly EnumBlock[]): string[] {
  const dropped = new Set<number>();
  for (const block of blocks) {
    for (let line = block.firstLine; line <= block.lastLine; line++) {
      dropped.add(line);
    }
  }
  return lines.filter((_, index) => !dropped.has(index));
}

/** Whether `candidate` is `golden` with one reference to a golden enum switched to an added one. */
function isEnumSwitched(
  golden: string,
  candidate: string,
  goldenEnums: ReadonlyMap<string, EnumBlock>,
  added: readonly EnumBlock[],
): boolean {
  for (const [name, shared] of goldenEnums) {
    const reference = wholeNameReference(name);
    if (!reference.test(golden)) {
      continue;
    }
    const isSwitched = added.some(
      (own) => own.members !== shared.members && golden.replace(reference, own.name) === candidate,
    );
    if (isSwitched) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the candidate differs from the golden text only by added enums and by references that
 * moved from a golden enum to an added enum of other values. Both texts are normalized.
 */
export function isSharedEnumSplit(goldenText: string, candidateText: string): boolean {
  const goldenLines = goldenText.split("\n");
  const candidateLines = candidateText.split("\n");
  const goldenEnums = enumBlocks(goldenLines);
  const added = [...enumBlocks(candidateLines).values()].filter(
    (block) => !goldenEnums.has(block.name),
  );
  const kept = withoutBlocks(candidateLines, added);
  if (kept.length !== goldenLines.length) {
    return false;
  }
  const changed = goldenLines.flatMap((line, index) =>
    line === kept[index] ? [] : [{ golden: line, candidate: kept[index] ?? "" }],
  );
  return (
    changed.length > 0 &&
    changed.every((pair) => isEnumSwitched(pair.golden, pair.candidate, goldenEnums, added))
  );
}
