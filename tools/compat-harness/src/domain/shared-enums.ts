/**
 * With `--dedupe-enums` the golden generator gave a schema the enum of another schema whose values
 * print alike, so a property of the strings `"1" | "2"` took an enum of the numbers `1 | 2` (RC5
 * G1). The current generator declares an enum of the property's own values and points the property
 * at it, which changes types of output that compiles.
 */

/** The first line of an enum declaration, as both generators print it. */
const ENUM_START_RE = /^export (?:const |declare )*enum ([\p{ID_Start}_$][\p{ID_Continue}$]*) \{/u;
const ENUM_END = "}";

/** An enum declaration: its name, its member lines and the line numbers it spans. */
interface EnumBlock {
  readonly name: string;
  readonly members: string;
  readonly firstLine: number;
  readonly lastLine: number;
}

function enumBlockAt(lines: readonly string[], firstLine: number): EnumBlock | undefined {
  const name = ENUM_START_RE.exec(lines[firstLine] ?? "")?.[1];
  if (name === undefined) {
    return undefined;
  }
  const end = lines.indexOf(ENUM_END, firstLine);
  const lastLine = end === -1 ? lines.length - 1 : end;
  const members = lines
    .slice(firstLine + 1, lastLine)
    .map((line) => line.trim())
    .join("\n");
  return { name, members, firstLine, lastLine };
}

/** The enum declarations of the text by name. */
function enumBlocks(lines: readonly string[]): Map<string, EnumBlock> {
  const blocks = lines.flatMap((_, index) => enumBlockAt(lines, index) ?? []);
  return new Map(blocks.map((block) => [block.name, block]));
}

function withoutBlocks(lines: readonly string[], blocks: readonly EnumBlock[]): string[] {
  const dropped = new Set<number>();
  for (const block of blocks) {
    for (let line = block.firstLine; line <= block.lastLine; line++) {
      dropped.add(line);
    }
  }
  return lines.filter((_, index) => !dropped.has(index));
}

const escapeName = (name: string): string => name.replaceAll("$", "\\$");

/** Whether `candidate` is `golden` with one reference to a golden enum switched to an added one. */
function isEnumSwitched(
  golden: string,
  candidate: string,
  goldenEnums: ReadonlyMap<string, EnumBlock>,
  added: readonly EnumBlock[],
): boolean {
  for (const [name, shared] of goldenEnums) {
    const reference = new RegExp(
      `(?<![\\p{ID_Continue}$])${escapeName(name)}(?![\\p{ID_Continue}$])`,
      "u",
    );
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
