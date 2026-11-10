/**
 * The golden output of an object with `properties` and an `additionalProperties` of another type:
 * the properties, then `& { [key: string]: T; }`. A property of a type that `T` does not admit
 * leaves the intersection no value; the candidate adds such property types to `T` (legacy bug 20).
 *
 * The pattern takes an object and the index signature right after it, whose type is one line, or
 * an object or an intersection of objects over several lines. A member is one line (JSDoc lines allowed) or spans lines, as a
 * nested object does: its inner lines are indented deeper, its closing line starts with `}`.
 * The object's first line may be `{` alone, as a tuple element is. Group 1 is its indent.
 */
export const OBJECT_WITH_INDEX_SIGNATURE =
  /^( +)(?:\S[^\n]*)?\{\n(?:\1 {4}(?:\S| \*)[^\n]*\n|\1 {8}[^\n]*\n)+\1\} & \{\n\1 {4}(?:readonly )?\[key: string\]: (?:[^\n]+;|\{\n(?:\1 {8}[^\n]*\n|\1 {4}\} & \{\n)+\1 {4}\};)$/gm;

const PROPERTY_MEMBER =
  /^(?:readonly )?(?:"(?:[^"\\]|\\.)*"|[\p{ID_Start}_$][\p{ID_Continue}$]*)\??: ([\s\S]+);$/u;
/** Where the index signature starts in a match: the object's members end right before it. */
const INDEX_START = "} & {\n";
/** The index signature: its indent, its key part and its type (which may span lines). */
const INDEX_MEMBER = /^( *)((?:readonly )?\[key: string\]: )([\s\S]+);$/;
const UNION_SEPARATOR = " | ";
const UNKNOWN_TYPE = "unknown";

const INTERSECTION_SEPARATOR = " & ";
const OPENING_BRACKETS = "<([{";
const CLOSING_BRACKETS = ">)]}";
const COMMENT_START = "/*";
const COMMENT_END = "*/";

/** Where a character starts that is outside brackets, string literals and comments of the type. */
function topLevelIndexes(type: string): number[] {
  const indexes: number[] = [];
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < type.length; index++) {
    const character = type[index] ?? "";
    if (quote !== null) {
      quote = character === quote && type[index - 1] !== "\\" ? null : quote;
    } else if (type.startsWith(COMMENT_START, index)) {
      index = type.indexOf(COMMENT_END, index) + COMMENT_END.length - 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (OPENING_BRACKETS.includes(character)) {
      depth++;
    } else if (CLOSING_BRACKETS.includes(character)) {
      depth--;
    } else if (depth === 0) {
      indexes.push(index);
    }
  }
  return indexes;
}

/** The top-level union members of a type: a ` | ` inside brackets, strings or JSDoc is not one. */
function unionMembers(type: string): string[] {
  const separators = topLevelIndexes(type).filter((index) =>
    type.startsWith(UNION_SEPARATOR, index),
  );
  const starts = [0, ...separators.map((index) => index + UNION_SEPARATOR.length)];
  return starts.map((start, at) => type.slice(start, separators[at] ?? type.length));
}

/** A union member as the candidate prints it: an intersection in brackets. */
function unionMemberText(member: string): string {
  const isIntersection = topLevelIndexes(member).some((index) =>
    member.startsWith(INTERSECTION_SEPARATOR, index),
  );
  return isIntersection ? `(${member})` : member;
}

const isComment = (line: string): boolean => line.startsWith("/**") || line.startsWith("*");

const indentOf = (line: string): number => line.length - line.trimStart().length;

/**
 * The members of the object lines, without JSDoc: a line at the member indent starts one, and a
 * deeper line or a closing `}` line continues it. A JSDoc line is one column deeper at most.
 */
function memberTexts(memberLines: readonly string[]): string[] {
  const memberIndent = indentOf(memberLines[0] ?? "");
  const members: string[] = [];
  for (const line of memberLines) {
    const text = line.trimStart();
    const isMemberLevel = indentOf(line) <= memberIndent + 1;
    if (isMemberLevel && isComment(text)) {
      continue;
    }
    if (members.length > 0 && (!isMemberLevel || text.startsWith("}"))) {
      members[members.length - 1] += `\n${line}`;
    } else {
      members.push(text);
    }
  }
  return members;
}

/** The property types of the object lines, in order; null when a member is no property. */
function propertyTypes(memberLines: readonly string[]): string[] | null {
  const types: string[] = [];
  for (const member of memberTexts(memberLines)) {
    const type = PROPERTY_MEMBER.exec(member)?.[1];
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
  const indexMembers = unionMembers(indexType);
  const members = [...indexMembers];
  for (const type of types) {
    const typeMembers = unionMembers(type);
    if (!typeMembers.every((member) => isHeld(member, members))) {
      members.push(...typeMembers.filter((member) => !members.includes(member)));
    }
  }
  const isWidened = members.length > indexMembers.length;
  return isWidened ? members.map(unionMemberText).join(UNION_SEPARATOR) : indexType;
}

/** Rewrite every match of OBJECT_WITH_INDEX_SIGNATURE in the text as the candidate writes it. */
function withNestedIndexPropertyTypes(text: string): string {
  const pattern = new RegExp(OBJECT_WITH_INDEX_SIGNATURE.source, OBJECT_WITH_INDEX_SIGNATURE.flags);
  return text.replace(pattern, (match) => withIndexPropertyTypes(match));
}

/**
 * Rewrite one match of OBJECT_WITH_INDEX_SIGNATURE as the candidate writes it. The members are
 * rewritten first: a nested object of a member may have such an index signature too, and the
 * candidate adds the property types as it writes them.
 */
export function withIndexPropertyTypes(match: string): string {
  const firstLineEnd = match.indexOf("\n") + 1;
  // The members end at the `} & {` of the object's own indent; an index type may have deeper ones.
  const boundary = `\n${match.slice(0, indentOf(match))}${INDEX_START}`;
  const membersEnd = match.indexOf(boundary) + 1;
  const indexAt = membersEnd + boundary.length - 1;
  const [, indent = "", prefix = "", indexType = ""] =
    INDEX_MEMBER.exec(match.slice(indexAt)) ?? [];
  const members = withNestedIndexPropertyTypes(match.slice(firstLineEnd, membersEnd));
  const types = propertyTypes(members.split("\n").slice(0, -1));
  if (types === null || prefix === "") {
    return match;
  }
  const head = `${match.slice(0, firstLineEnd)}${members}${match.slice(membersEnd, indexAt)}`;
  return `${head}${indent}${prefix}${widenedIndexType(indexType, types)};`;
}
