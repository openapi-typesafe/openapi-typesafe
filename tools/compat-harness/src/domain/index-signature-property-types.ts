/**
 * The golden output of an object with `properties` and an `additionalProperties` of another type:
 * the properties, then `& { [key: string]: T; }`. A property of a type that `T` does not admit
 * leaves the intersection no value; the candidate adds such property types to `T` (legacy bug 20).
 *
 * The pattern takes an object whose members are one line each (JSDoc lines allowed) and the index
 * signature right after it, whose type is one line or an object over several lines. Group 1 is the
 * indent of the object's first line.
 */
export const OBJECT_WITH_INDEX_SIGNATURE =
  /^( +)\S[^\n]*\{\n(?:\1 {4}(?:\S| \*)[^\n]*\n)+\1\} & \{\n\1 {4}(?:readonly )?\[key: string\]: (?:[^\n]+;|\{\n(?:\1 {8}[^\n]*\n)+\1 {4}\};)$/gm;

const PROPERTY_LINE =
  /^(?:readonly )?(?:"(?:[^"\\]|\\.)*"|[\p{ID_Start}_$][\p{ID_Continue}$]*)\??: (.+);$/u;
/** Where the index signature starts in a match: the object's members end right before it. */
const INDEX_START = "} & {\n";
/** The index signature: its indent, its key part and its type (which may span lines). */
const INDEX_MEMBER = /^( *)((?:readonly )?\[key: string\]: )([\s\S]+);$/;
const UNION_SEPARATOR = " | ";
const UNKNOWN_TYPE = "unknown";

const OPENING_BRACKETS = "<([{";
const CLOSING_BRACKETS = ">)]}";

/**
 * The top-level union members of a one-line type: a ` | ` inside brackets, a generic or a string
 * literal belongs to its member.
 */
function unionMembers(type: string): string[] {
  const members: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | null = null;
  for (let index = 0; index < type.length; index++) {
    const character = type[index] ?? "";
    if (quote !== null) {
      quote = character === quote && type[index - 1] !== "\\" ? null : quote;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (OPENING_BRACKETS.includes(character)) {
      depth++;
    } else if (CLOSING_BRACKETS.includes(character)) {
      depth--;
    } else if (depth === 0 && type.startsWith(UNION_SEPARATOR, index)) {
      members.push(type.slice(start, index));
      start = index + UNION_SEPARATOR.length;
    }
  }
  return [...members, type.slice(start)];
}

/** The property types of the object lines, in order; null when a member line is no property. */
function propertyTypes(memberLines: readonly string[]): string[] | null {
  const types: string[] = [];
  for (const line of memberLines.map((text) => text.trim())) {
    if (line.startsWith("/**") || line.startsWith("*")) {
      continue;
    }
    const type = PROPERTY_LINE.exec(line)?.[1];
    if (type === undefined) {
      return null;
    }
    types.push(type);
  }
  return types;
}

/** The keyword a literal type widens to, or null for no literal. */
function literalKeyword(type: string): string | null {
  if (/^"(?:[^"\\]|\\.)*"$/.test(type)) {
    return "string";
  }
  if (/^-?\d+(?:\.\d+)?$/.test(type)) {
    return "number";
  }
  return type === "true" || type === "false" ? "boolean" : null;
}

/** The element type of `T[]` or `(A | B)[]`, or null for no array type. */
function arrayElement(type: string): string | null {
  if (!type.endsWith("[]")) {
    return null;
  }
  const element = type.slice(0, -2);
  return element.startsWith("(") && element.endsWith(")") ? element.slice(1, -1) : element;
}

/**
 * Whether a member is assignable to one of the index members, by the rules the generator proves
 * from the text alone: the same type, a literal of a keyword, or an array of such elements.
 */
function isHeld(member: string, indexMembers: readonly string[]): boolean {
  const keyword = literalKeyword(member);
  if (indexMembers.includes(member) || (keyword !== null && indexMembers.includes(keyword))) {
    return true;
  }
  const element = arrayElement(member);
  if (element === null) {
    return false;
  }
  return indexMembers.some((indexMember) => {
    const indexElement = arrayElement(indexMember);
    const elementMembers = indexElement === null ? null : unionMembers(indexElement);
    return (
      elementMembers !== null && unionMembers(element).every((part) => isHeld(part, elementMembers))
    );
  });
}

/**
 * The index type with each property type that it does not hold, as the candidate adds them. The
 * candidate also leaves out types that TypeScript finds assignable in other ways; such a case
 * stays a difference.
 */
function widenedIndexType(indexType: string, types: readonly string[]): string {
  if (indexType === UNKNOWN_TYPE) {
    return indexType;
  }
  const members = unionMembers(indexType);
  for (const type of types) {
    const typeMembers = unionMembers(type);
    if (!typeMembers.every((member) => isHeld(member, members))) {
      members.push(...typeMembers.filter((member) => !members.includes(member)));
    }
  }
  return members.join(UNION_SEPARATOR);
}

/** Rewrite one match of OBJECT_WITH_INDEX_SIGNATURE as the candidate writes it. */
export function withIndexPropertyTypes(match: string): string {
  const indexAt = match.lastIndexOf(INDEX_START) + INDEX_START.length;
  const [, indent = "", prefix = "", indexType = ""] =
    INDEX_MEMBER.exec(match.slice(indexAt)) ?? [];
  // The members are the lines between the object's first line and the indent of `} & {`.
  const memberLines = match
    .slice(0, indexAt - INDEX_START.length)
    .split("\n")
    .slice(1, -1);
  const types = propertyTypes(memberLines);
  if (types === null || prefix === "") {
    return match;
  }
  return `${match.slice(0, indexAt)}${indent}${prefix}${widenedIndexType(indexType, types)};`;
}
