/**
 * With `--enum` the golden generator typed a property of an `allOf` item by an enum of its own
 * (`Pet & { mode?: CatMode }`) where the base already types it by another enum (`PetMode`). Two
 * TypeScript enums intersect to `never`, so the schema had no value there, and the output compiled
 * (ADR-021, 2026-11-16). The current generator types the property by the base's enum, narrowed to
 * the values both list (`PetMode.a`), which changes types of output that compiles.
 */

import {
  type EnumBlock,
  enumBlockAt,
  IDENTIFIER_PATTERN,
  memberValues,
  wholeNameReference,
} from "./enum-declarations.ts";
import { isBeforeIntersection, isLiteralUnionUnified } from "./intersected-literals.ts";

/** How a line ends that opens an object literal intersected with what precedes it. */
const INTERSECTION_OPENING = " & {";
/** The first character that is not a space, or the end of an empty or blank line. */
const NOT_A_SPACE_RE = /[^ ]|$/;
const UNION_SEPARATOR = " | ";
/** A reference to a whole enum (group 1) or to one of its members (group 2). */
const ENUM_TYPE_RE = new RegExp(`^(${IDENTIFIER_PATTERN})(?:\\.(${IDENTIFIER_PATTERN}))?$`, "u");
const IDENTIFIER_RE = new RegExp(IDENTIFIER_PATTERN, "gu");
/** Characters before a name that make it a member or a quoted key, not a type. */
const NOT_A_TYPE_BEFORE = new Set([".", '"']);

/** The lines before the enum declarations, and the declarations that follow them to the end. */
interface DeclaredEnums {
  readonly body: readonly string[];
  readonly blocks: ReadonlyMap<string, EnumBlock>;
}

/**
 * Splits the text where its first enum declaration starts; undefined when it declares no enum (so
 * nothing to unify), anything but enum declarations (and a final empty line) follows the first,
 * or a name is declared twice.
 */
function declaredEnums(text: string): DeclaredEnums | undefined {
  const lines = text.split("\n");
  const footerStart = lines.findIndex((_, index) => enumBlockAt(lines, index) !== undefined);
  if (footerStart === -1) {
    return undefined;
  }
  const blocks = new Map<string, EnumBlock>();
  let index = footerStart;
  while (index < lines.length) {
    const block = enumBlockAt(lines, index);
    if (block === undefined) {
      return index === lines.length - 1 && lines[index] === ""
        ? { body: lines.slice(0, footerStart), blocks }
        : undefined;
    }
    if (blocks.has(block.name)) {
      return undefined;
    }
    blocks.set(block.name, block);
    index = block.lastLine + 1;
  }
  return { body: lines.slice(0, footerStart), blocks };
}

const indentation = (line: string): number => line.search(NOT_A_SPACE_RE);

/**
 * Whether the line sits in an object literal that a line ending in ` & {` opens, at any depth. The
 * generator indents each level, so the opener of a line's literal is the nearest line above it
 * with less indentation (JSDoc lines are indented more than the property they describe).
 */
function isInIntersection(lines: readonly string[], lineIndex: number): boolean {
  let depth = indentation(lines[lineIndex] ?? "");
  for (let index = lineIndex - 1; index >= 0 && depth > 0; index--) {
    const line = lines[index] ?? "";
    if (indentation(line) >= depth) {
      continue;
    }
    if (line.endsWith(INTERSECTION_OPENING)) {
      return true;
    }
    depth = indentation(line);
  }
  return false;
}

/**
 * The values of a type that is an enum other than `own`, its member or a union of its members;
 * an undefined value for a member the enum does not declare.
 */
function baseEnumValues(
  type: string,
  own: string,
  enums: ReadonlyMap<string, EnumBlock>,
): (string | undefined)[] | undefined {
  const parts = type.split(UNION_SEPARATOR).map((part) => ENUM_TYPE_RE.exec(part));
  const baseName = parts[0]?.[1];
  const base = baseName === undefined ? undefined : enums.get(baseName);
  if (base === undefined || baseName === own || parts.some((part) => part?.[1] !== baseName)) {
    return undefined;
  }
  const values = memberValues(base);
  return parts.flatMap((part) => {
    const member = part?.[2];
    return member === undefined ? [...values.values()] : [values.get(member)];
  });
}

/** The golden enums a line names as types, and where each name starts. */
function enumReferences(
  line: string,
  enums: ReadonlyMap<string, EnumBlock>,
): { block: EnumBlock; start: number }[] {
  return [...line.matchAll(IDENTIFIER_RE)].flatMap(({ 0: name, index: start }) => {
    const block = enums.get(name);
    const isType = !NOT_A_TYPE_BEFORE.has(line[start - 1] ?? "");
    return block !== undefined && isType ? [{ block, start }] : [];
  });
}

/**
 * The own enum whose reference the candidate line replaces by the base enum, its member or a union
 * of its members, each a value of the own enum; undefined when the line changed otherwise.
 */
function unifiedEnum(
  golden: string,
  candidate: string,
  enums: ReadonlyMap<string, EnumBlock>,
): string | undefined {
  for (const { block, start } of enumReferences(golden, enums)) {
    const prefix = golden.slice(0, start);
    const suffix = golden.slice(start + block.name.length);
    if (!candidate.startsWith(prefix) || !candidate.endsWith(suffix)) {
      continue;
    }
    const type = candidate.slice(prefix.length, candidate.length - suffix.length);
    // The change sits at this reference, so the line is decided here.
    const own: ReadonlySet<string | undefined> = new Set(memberValues(block).values());
    const admitted = baseEnumValues(type, block.name, enums);
    return admitted?.every((value) => own.has(value)) ? block.name : undefined;
  }
  return undefined;
}

/** What the changed body lines unified: the own enums they replaced, and how many lines. */
interface Unified {
  readonly ownEnums: ReadonlySet<string>;
  readonly lineCount: number;
}

/** Whether a line sits in an object literal intersected with another, before or after it. */
function isIntersected(lines: readonly string[], index: number): boolean {
  return isInIntersection(lines, index) || isBeforeIntersection(lines, index);
}

/**
 * The own enums the changed body lines unified with another part's enum, or whose literals they
 * typed by its members (`isLiteralUnionUnified`); undefined when another line changed.
 */
function unifiedEnums(golden: DeclaredEnums, candidate: DeclaredEnums): Unified | undefined {
  if (golden.body.length !== candidate.body.length) {
    return undefined;
  }
  const ownEnums = new Set<string>();
  let lineCount = 0;
  for (const [index, line] of golden.body.entries()) {
    const changed = candidate.body[index] ?? "";
    if (line === changed) {
      continue;
    }
    if (!isIntersected(golden.body, index)) {
      return undefined;
    }
    const own = unifiedEnum(line, changed, golden.blocks);
    if (own === undefined && !isLiteralUnionUnified(line, changed, golden.blocks)) {
      return undefined;
    }
    lineCount += 1;
    if (own !== undefined) {
      ownEnums.add(own);
    }
  }
  return { ownEnums, lineCount };
}

/**
 * Whether the candidate declares only golden enums, unchanged in any order, and leaves out only
 * unified own enums that nothing references any more.
 */
function isFooterKept(
  golden: DeclaredEnums,
  candidate: DeclaredEnums,
  unified: ReadonlySet<string>,
): boolean {
  const isEveryKept = [...candidate.blocks.values()].every(
    (block) => golden.blocks.get(block.name)?.members === block.members,
  );
  const candidateBody = candidate.body.join("\n");
  const removed = [...golden.blocks.keys()].filter((name) => !candidate.blocks.has(name));
  return (
    isEveryKept &&
    removed.every((name) => unified.has(name) && !wholeNameReference(name).test(candidateBody))
  );
}

/**
 * Whether the candidate differs from the golden text only by intersected own enums unified with
 * their base's enum, the own declarations this left unused, and the order of the enum declarations
 * at the end of the file. Both texts are normalized.
 *
 * A changed line must sit in an object literal opened by ` & {`, and replace one reference to a
 * golden enum by another golden enum, its member or a union of its members, where every value the
 * replacement admits is a value of the replaced enum: the base's values the own enum also lists.
 * Which enum the intersected base declares is not checked: the base is often reached through
 * `$ref`s and `Omit<…>` that the text does not resolve, so the shape of the change is the test.
 */
export function isIntersectedEnumUnified(goldenText: string, candidateText: string): boolean {
  const golden = declaredEnums(goldenText);
  const candidate = declaredEnums(candidateText);
  if (golden === undefined || candidate === undefined) {
    return false;
  }
  const unified = unifiedEnums(golden, candidate);
  return (
    unified !== undefined &&
    unified.lineCount > 0 &&
    isFooterKept(golden, candidate, unified.ownEnums)
  );
}
