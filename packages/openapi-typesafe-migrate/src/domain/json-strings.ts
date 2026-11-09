/**
 * The string values of a JSON document with their key paths and offsets, so a migration can
 * replace one value and keep the rest of the file byte for byte. It also reads JSONC (`//` and
 * block comments, trailing commas), as `deno.jsonc` and Nx `project.json` allow.
 */

/** A key path: object keys and array indexes from the root. */
export type JsonPath = readonly (string | number)[];

/** A string value; `start` and `end` include its quotes. */
export interface JsonString {
  readonly path: JsonPath;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

class JsonSyntaxError extends Error {}

/** A cursor over the text that collects the string values it passes. */
interface Reader {
  readonly text: string;
  index: number;
  readonly strings: JsonString[];
}

const WHITESPACE_RE = /\s/;
/** A number, `true`, `false` or `null`. */
const SCALAR_RE = /true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/** The end of a comment that starts at `index`, or undefined if none starts there. */
function commentEnd(text: string, index: number): number | undefined {
  if (text.startsWith("//", index)) {
    const lineEnd = text.indexOf("\n", index);
    return lineEnd === -1 ? text.length : lineEnd;
  }
  if (!text.startsWith("/*", index)) {
    return undefined;
  }
  const close = text.indexOf("*/", index + 2);
  if (close === -1) {
    throw new JsonSyntaxError(`unterminated comment at offset ${index}`);
  }
  return close + 2;
}

function skipTrivia(reader: Reader): void {
  for (;;) {
    while (WHITESPACE_RE.test(reader.text[reader.index] ?? "")) {
      reader.index++;
    }
    const end = commentEnd(reader.text, reader.index);
    if (end === undefined) {
      return;
    }
    reader.index = end;
  }
}

function expect(reader: Reader, char: string): void {
  skipTrivia(reader);
  if (reader.text[reader.index] !== char) {
    throw new JsonSyntaxError(`expected ${char} at offset ${reader.index}`);
  }
  reader.index++;
}

/** A string literal at the cursor, decoded by the JSON rules. */
function readString(reader: Reader): JsonString & { readonly path: [] } {
  const start = reader.index;
  let index = start + 1;
  while (index < reader.text.length && reader.text[index] !== '"') {
    index += reader.text[index] === "\\" ? 2 : 1;
  }
  if (index >= reader.text.length) {
    throw new JsonSyntaxError(`unterminated string at offset ${start}`);
  }
  reader.index = index + 1;
  const value: unknown = JSON.parse(reader.text.slice(start, index + 1));
  return { path: [], value: value as string, start, end: index + 1 };
}

/** The items of an object or an array, up to `close`, each read by `readItem`. */
function readItems(reader: Reader, close: string, readItem: (index: number) => void): void {
  for (let count = 0; ; count++) {
    skipTrivia(reader);
    if (reader.text[reader.index] === close) {
      reader.index++;
      return;
    }
    if (count > 0) {
      expect(reader, ",");
      skipTrivia(reader);
      // A trailing comma (JSONC) closes the collection.
      if (reader.text[reader.index] === close) {
        reader.index++;
        return;
      }
    }
    readItem(count);
  }
}

function readObject(reader: Reader, path: JsonPath): void {
  readItems(reader, "}", () => {
    skipTrivia(reader);
    if (reader.text[reader.index] !== '"') {
      throw new JsonSyntaxError(`expected a key at offset ${reader.index}`);
    }
    const key = readString(reader).value;
    expect(reader, ":");
    readValue(reader, [...path, key]);
  });
}

function readValue(reader: Reader, path: JsonPath): void {
  skipTrivia(reader);
  const char = reader.text[reader.index];
  if (char === "{") {
    reader.index++;
    readObject(reader, path);
  } else if (char === "[") {
    reader.index++;
    readItems(reader, "]", (index) => readValue(reader, [...path, index]));
  } else if (char === '"') {
    reader.strings.push({ ...readString(reader), path });
  } else {
    SCALAR_RE.lastIndex = reader.index;
    if (SCALAR_RE.exec(reader.text) === null) {
      throw new JsonSyntaxError(`expected a value at offset ${reader.index}`);
    }
    reader.index = SCALAR_RE.lastIndex;
  }
}

/** The string values of a JSON or JSONC text in file order, or undefined if it is not valid. */
export function jsonStrings(text: string): JsonString[] | undefined {
  const reader: Reader = { text, index: 0, strings: [] };
  try {
    readValue(reader, []);
    skipTrivia(reader);
    return reader.index === text.length ? reader.strings : undefined;
  } catch (error) {
    // A malformed string literal fails in JSON.parse with a SyntaxError.
    if (error instanceof JsonSyntaxError || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}
