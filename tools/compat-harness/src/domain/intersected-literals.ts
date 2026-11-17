/**
 * With `--enum` the golden generator typed a property by literals (`"a" | "b" | null`, a `const`,
 * an enum it keeps as a union) where the other part of an intersection types it by a TypeScript
 * enum (`Mode`). An enum member is no literal, so the property had no value there, and the output
 * compiled (ADR-021, 2026-11-17). The current generator types the literals by the enum's members
 * (`Mode | null`), which changes types of output that compiles.
 */

import { type EnumBlock, IDENTIFIER_PATTERN, memberValues } from "./enum-declarations.ts";

const UNION_SEPARATOR = " | ";
/** A property line: what precedes its type (group 1) and the type (group 2), before the `;`. */
const PROPERTY_RE = new RegExp(
  `^( *(?:readonly )?(?:${IDENTIFIER_PATTERN}|"(?:[^"\\\\]|\\\\.)*")\\??: )(.+);$`,
  "u",
);
/** A literal as both generators print one: a string, a number, a boolean or `null`. */
const LITERAL_RE = /^(?:"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)$/u;
/** A reference to a whole enum (group 1) or to one of its members (group 2). */
const ENUM_TYPE_RE = new RegExp(`^(${IDENTIFIER_PATTERN})(?:\\.(${IDENTIFIER_PATTERN}))?$`, "u");
/** The generator groups a union in a union in parentheses (`(Mode.a | "x") | null`). */
const GROUPING_RE = /[()]/gu;
/** The first character that is not a space, or the end of an empty or blank line. */
const NOT_A_SPACE_RE = /[^ ]|$/;
/** How a line starts that closes an object literal intersected with what follows it. */
const INTERSECTION_CLOSING = "} & ";

const indentation = (line: string): number => line.search(NOT_A_SPACE_RE);

/**
 * Whether the line sits in an object literal that a line starting with `} & ` closes, at any
 * depth: the literal is intersected with the one after it. The closer of a line's literal is the
 * nearest line below it with less indentation.
 */
export function isBeforeIntersection(lines: readonly string[], lineIndex: number): boolean {
  let depth = indentation(lines[lineIndex] ?? "");
  for (let index = lineIndex + 1; index < lines.length && depth > 0; index++) {
    const line = lines[index] ?? "";
    if (indentation(line) >= depth) {
      continue;
    }
    if (line.trimStart().startsWith(INTERSECTION_CLOSING)) {
      return true;
    }
    depth = indentation(line);
  }
  return false;
}

/** The values a part of the replacement admits, as printed; undefined for no golden enum. */
function partValues(part: string, enums: ReadonlyMap<string, EnumBlock>): string[] | undefined {
  if (LITERAL_RE.test(part)) {
    return [part];
  }
  const reference = ENUM_TYPE_RE.exec(part);
  const block = reference?.[1] === undefined ? undefined : enums.get(reference[1]);
  if (block === undefined) {
    return undefined;
  }
  const values = memberValues(block);
  const member = reference?.[2];
  if (member === undefined) {
    return [...values.values()];
  }
  const value = values.get(member);
  return value === undefined ? undefined : [value];
}

/**
 * Whether the candidate line types the golden line's literals by golden enums: the same property,
 * a union of enums, their members and literals for a union of literals, which admits only golden
 * values and names at least one enum.
 */
export function isLiteralUnionUnified(
  golden: string,
  candidate: string,
  enums: ReadonlyMap<string, EnumBlock>,
): boolean {
  const goldenProperty = PROPERTY_RE.exec(golden);
  const candidateProperty = PROPERTY_RE.exec(candidate);
  if (goldenProperty === null || candidateProperty?.[1] !== goldenProperty[1]) {
    return false;
  }
  // Only a literal part of the golden type can be a value the replacement admits: enum members
  // are printed as literals, and each value must be one the golden type lists.
  const literals = new Set((goldenProperty[2] ?? "").split(UNION_SEPARATOR));
  const parts = (candidateProperty?.[2] ?? "").replace(GROUPING_RE, "").split(UNION_SEPARATOR);
  const admitted = parts.map((part) => partValues(part, enums));
  const isEveryKnown = admitted.every((values) => values?.every((value) => literals.has(value)));
  return isEveryKnown && parts.some((part) => !LITERAL_RE.test(part));
}
