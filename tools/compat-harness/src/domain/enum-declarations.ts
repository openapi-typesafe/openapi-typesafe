/**
 * Enum declarations of generated output as both generators print them: `export enum Name {`, one
 * member per line, and `}` alone on the closing line. The enum recognizers read the texts with
 * these helpers, so they agree on what a declaration and a reference are.
 */

/** A name as TypeScript reads an identifier. */
export const IDENTIFIER_PATTERN = "[\\p{ID_Start}_$][\\p{ID_Continue}$]*";

/** The first line of an enum declaration. */
const ENUM_START_RE = new RegExp(
  `^export (?:const |declare )*enum (${IDENTIFIER_PATTERN}) \\{`,
  "u",
);
const ENUM_END = "}";
const EMPTY_BODY = "{}";

/** An enum declaration: its name, its trimmed member lines and the line numbers it spans. */
export interface EnumBlock {
  readonly name: string;
  readonly members: string;
  readonly firstLine: number;
  readonly lastLine: number;
}

/** The enum declaration that starts at `firstLine`, if one does. */
export function enumBlockAt(lines: readonly string[], firstLine: number): EnumBlock | undefined {
  const line = lines[firstLine] ?? "";
  const name = ENUM_START_RE.exec(line)?.[1];
  if (name === undefined) {
    return undefined;
  }
  if (line.endsWith(EMPTY_BODY)) {
    return { name, members: "", firstLine, lastLine: firstLine };
  }
  const end = lines.indexOf(ENUM_END, firstLine);
  const lastLine = end === -1 ? lines.length - 1 : end;
  const members = lines
    .slice(firstLine + 1, lastLine)
    .map((member) => member.trim())
    .join("\n");
  return { name, members, firstLine, lastLine };
}

/** The enum declarations of the text by name. */
export function enumBlocks(lines: readonly string[]): Map<string, EnumBlock> {
  const blocks = lines.flatMap((_, index) => enumBlockAt(lines, index) ?? []);
  return new Map(blocks.map((block) => [block.name, block]));
}

/** A pattern of `name` as a whole identifier, not a part of a longer one. */
export function wholeNameReference(name: string): RegExp {
  const escaped = name.replaceAll("$", "\\$");
  return new RegExp(`(?<![\\p{ID_Continue}$])${escaped}(?![\\p{ID_Continue}$])`, "u");
}
