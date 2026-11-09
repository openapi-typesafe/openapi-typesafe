/**
 * Finds the scalar values of chosen keys in a YAML file, by offsets into the text, so the
 * migration can edit them in place and keep comments and formatting. It reads the block style of
 * CI and tool configs line by line: `key: value`, quoted values, `|` and `>` block scalars, and a
 * key whose value is a list of scalars. Flow collections (`[…]`, `{…}`) are not read.
 */

/** A scalar value: the text between `start` and `end`, inside the quotes of a quoted one. */
export interface YamlValue {
  readonly start: number;
  readonly end: number;
  /** A folded block scalar (`>`) turns line breaks into spaces. */
  readonly isFolded: boolean;
}

interface Line {
  readonly start: number;
  readonly text: string;
  readonly indent: number;
}

/** `key: value`, also as a list item (`- key: value`) and with a quoted key. */
const KEY_LINE_RE = /^(\s*(?:-\s+)*)(["']?)([A-Za-z_$][\w.$-]*)\2\s*:(?:\s+|$)/;
const LIST_ITEM_RE = /^(\s*)-(?:\s+|$)/;
const BLOCK_SCALAR_RE = /^[|>][-+0-9]*\s*(?:#.*)?$/;
const FLOW_START = new Set(["[", "{"]);
/** A comment after a plain scalar starts with a blank and `#`. */
const TRAILING_COMMENT_RE = /\s+#.*$/;

function linesOf(text: string): Line[] {
  let start = 0;
  return text.split("\n").map((line) => {
    const found: Line = { start, text: line, indent: line.length - line.trimStart().length };
    start += line.length + 1;
    return found;
  });
}

const isBlank = (line: Line): boolean => line.text.trim() === "" || line.text.trim()[0] === "#";

/** The end of the lines that belong to a node at `column`: blank ones and deeper ones. */
function blockEnd(lines: readonly Line[], from: number, column: number): number {
  const isInside = (line: Line): boolean => isBlank(line) || line.indent > column;
  let index = from;
  while (index < lines.length && isInside(lines[index] as Line)) {
    index++;
  }
  // Trailing blank lines are not part of the value.
  while (index > from && isBlank(lines[index - 1] as Line)) {
    index--;
  }
  return index;
}

/** A quoted scalar that closes on its line, without the quotes. */
function quotedValue(line: Line, at: number): YamlValue | undefined {
  const quote = line.text[at] as string;
  const close = line.text.indexOf(quote, at + 1);
  return close === -1
    ? undefined
    : { start: line.start + at + 1, end: line.start + close, isFolded: false };
}

/** The value that starts at column `at` of line `index`, for a node at `column`. */
interface ValueAt {
  readonly lines: readonly Line[];
  readonly index: number;
  readonly at: number;
  readonly column: number;
}

interface Found {
  readonly values: YamlValue[];
  /** The first line after the value. */
  readonly next: number;
}

function scalarAt({ lines, index, at, column }: ValueAt): Found {
  const line = lines[index] as Line;
  const rest = line.text.slice(at).trimEnd();
  if (BLOCK_SCALAR_RE.test(rest)) {
    const end = blockEnd(lines, index + 1, column);
    const last = lines[end - 1] as Line;
    const isEmpty = end === index + 1;
    const value: YamlValue = {
      start: isEmpty ? line.start + line.text.length : (lines[index + 1] as Line).start,
      end: isEmpty ? line.start + line.text.length : last.start + last.text.length,
      isFolded: rest.startsWith(">"),
    };
    return { values: [value], next: end };
  }
  if (rest[0] === '"' || rest[0] === "'") {
    const quoted = quotedValue(line, at);
    return { values: quoted === undefined ? [] : [quoted], next: index + 1 };
  }
  const plainText = rest.replace(TRAILING_COMMENT_RE, "");
  const isPlain = plainText !== "" && !FLOW_START.has(plainText[0] as string);
  const start = line.start + at;
  const plain: YamlValue = { start, end: start + plainText.length, isFolded: false };
  return { values: isPlain ? [plain] : [], next: index + 1 };
}

/** The scalar items of a list under a key at `column`; mapping items are left to the caller. */
function listItems(lines: readonly Line[], from: number, column: number): Found {
  const values: YamlValue[] = [];
  let index = from;
  while (index < lines.length) {
    const line = lines[index] as Line;
    const item = LIST_ITEM_RE.exec(line.text);
    if (isBlank(line)) {
      index++;
    } else if (item === null || line.indent < column || KEY_LINE_RE.test(line.text)) {
      break;
    } else {
      const found = scalarAt({ lines, index, at: item[0].length, column: line.indent });
      values.push(...found.values);
      index = found.next;
    }
  }
  return { values, next: index };
}

/** The value of the key on line `index`, which ends at column `at`. */
function keyValue(lines: readonly Line[], index: number, at: number, column: number): Found {
  const line = lines[index] as Line;
  const rest = line.text.slice(at).trim();
  if (rest === "" || rest[0] === "#") {
    return listItems(lines, index + 1, column);
  }
  return scalarAt({ lines, index, at, column });
}

/**
 * The line after line `index`, past the content of a block scalar that the line opens, so text
 * inside a scalar (an OpenAPI `description: |`) is never read as keys.
 */
function nextNode(lines: readonly Line[], index: number): number {
  const line = lines[index] as Line;
  const node = KEY_LINE_RE.exec(line.text) ?? LIST_ITEM_RE.exec(line.text);
  const rest = node === null ? "" : line.text.slice(node[0].length).trim();
  if (node === null || !BLOCK_SCALAR_RE.test(rest)) {
    return index + 1;
  }
  const column = KEY_LINE_RE.test(line.text) ? (node[1] as string).length : line.indent;
  return blockEnd(lines, index + 1, column);
}

/** The scalar values of every key in `keys`, in file order. */
export function yamlValues(text: string, keys: ReadonlySet<string>): YamlValue[] {
  const lines = linesOf(text);
  const values: YamlValue[] = [];
  let index = 0;
  while (index < lines.length) {
    const match = KEY_LINE_RE.exec((lines[index] as Line).text);
    if (match === null || !keys.has(match[3] as string)) {
      index = Math.max(nextNode(lines, index), index + 1);
      continue;
    }
    const column = (match[1] as string).length;
    const found = keyValue(lines, index, match[0].length, column);
    values.push(...found.values);
    index = Math.max(found.next, index + 1);
  }
  return values;
}

/** A value of a mapping, by its key. */
export interface YamlEntry {
  readonly key: string;
  readonly value: YamlValue;
}

/** The scalar values of the mapping under the top-level key `parent`, such as `scripts:`. */
export function yamlMappingEntries(text: string, parent: string): YamlEntry[] {
  const lines = linesOf(text);
  const isParent = (line: Line): boolean =>
    line.indent === 0 && KEY_LINE_RE.exec(line.text)?.[3] === parent;
  const start = lines.findIndex(isParent);
  const entries: YamlEntry[] = [];
  if (start === -1) {
    return entries;
  }
  const end = blockEnd(lines, start + 1, 0);
  for (let index = start + 1; index < end; ) {
    const match = KEY_LINE_RE.exec((lines[index] as Line).text);
    if (match === null) {
      index++;
      continue;
    }
    const column = (match[1] as string).length;
    const found = scalarAt({ lines, index, at: match[0].length, column });
    entries.push(...found.values.map((value) => ({ key: match[3] as string, value })));
    index = Math.max(found.next, index + 1);
  }
  return entries;
}
