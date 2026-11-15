import { describe, expect, it } from "vitest";
import { commandStepMessage } from "../../src/application/command-step-messages.js";
import { migrateCommandLines } from "../../src/domain/command-migration.js";
import { placedCommands } from "../../src/domain/shell-words.js";
import {
  movedWord,
  placedSpan,
  placedWord,
  unquotedRawText,
  writtenSpan,
} from "../../src/domain/word-places.js";

const migrate = (text: string) => migrateCommandLines(text, "gen.sh");
const SPLIT_STEP = { kind: "split-flag", location: "gen.sh:1", flag: "-it" } as const;
const word = (raw: string, start: number) => ({ raw, value: raw, start, end: start + raw.length });

describe("migrateCommandLines and nested command lines", () => {
  it.each([
    [
      "sh -c 'npx openapi-typescript '\"'\"'a.yaml'\"'\"' -it'\n",
      "sh -c 'npx openapi-typesafe '\"'\"'a.yaml'\"'\"' --immutable'\n",
    ],
    [
      "sh -c \"X='npx openapi-typescript'; \\$X b.yaml -it\"\n",
      "sh -c \"X='npx openapi-typesafe'; \\$X b.yaml --immutable\"\n",
    ],
    [
      'bash -c "npx \\"openapi-typescript\\" a.yaml -it"\n',
      'bash -c "npx \\"openapi-typesafe\\" a.yaml --immutable"\n',
    ],
  ])("migrateCommandLines renames the generator in the quoted script %s", (text, migrated) => {
    expect(migrate(text).text).toBe(migrated);
    expect(migrate(text).manualSteps).toEqual([]);
  });

  it.each([
    ["sh -c 'npx openapi-'\"'\"'typescript'\"'\"' a.yaml'\n"],
    ["sh -c \"npx openapi-\"'typescript a.yaml'\n"],
  ])("migrateCommandLines reports an old name that quotes split in %s", (text) => {
    const migrated = migrate(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "gen.sh:1", word: "openapi-typescript" },
    ]);
  });
});

describe("migrateCommandLines and quoted flags", () => {
  it.each([
    ["npx openapi-typescript a.yaml '-it'\n", "npx openapi-typesafe a.yaml '--immutable'\n"],
    [
      'npx openapi-typescript a.yaml "--redoc=r.yaml"\n',
      'npx openapi-typesafe a.yaml "--redocly=r.yaml"\n',
    ],
  ])("migrateCommandLines renames the quoted flag of %s", (text, migrated) => {
    expect(migrate(text).text).toBe(migrated);
  });

  it.each([
    ["npx openapi-typescript a.yaml -i't'\n"],
    ["sh -c \"npx openapi-typescript a.yaml -\"'it'\n"],
    ["sh -c 'npx openapi-typescript a.yaml -'\"'\"'i'\"'\"'t'\n"],
  ])("migrateCommandLines reports the split flag of %s and keeps it", (text) => {
    const migrated = migrate(text);

    expect(migrated.text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([SPLIT_STEP]);
  });

  it("migrateCommandLines reports the quoted flag of a variable after the generator", () => {
    const text = "F=\"'-it'\"; npx openapi-typescript a.yaml $F\n";

    expect(migrate(text).manualSteps).toEqual([
      { kind: "flags-in-variable", location: "gen.sh:1", variable: "$F", flags: ["-it"] },
    ]);
  });

  it("commandStepMessage names the split flag and its new name", () => {
    expect(commandStepMessage(SPLIT_STEP)).toBe(
      "gen.sh:1: -it is an old flag of the generator that quotes split where it is written, " +
        "so it was kept: rename -it to --immutable",
    );
  });
});

describe("word places", () => {
  it("unquotedRawText places each kept character where it is written", () => {
    expect(unquotedRawText(word("a'b'c", 10), 0)).toEqual({ text: "abc", offsets: [10, 12, 14] });
  });

  it("placedWord of a word read from a placed text keeps the offsets of its characters", () => {
    const placed = unquotedRawText(word("x='a b'c", 0), 2);
    const [, second] = placedCommands(placed)[0] ?? [];

    expect(second).toMatchObject({ start: 5, end: 8, raw: "bc", written: [5, 7] });
  });

  it("placedWord of a word in one piece has no written offsets", () => {
    const placed = { text: "ab", offsets: [5, 6] };

    expect(placedWord(word("ab", 0), placed)).toEqual(word("ab", 5));
  });

  it("movedWord moves the written offsets with the word", () => {
    const split = { ...word("ab", 0), written: [0, 2] };

    expect(movedWord(split, 3)).toEqual({ ...word("ab", 3), written: [3, 5] });
  });

  it.each([
    [[0, 1, 2], 3, { start: 0, end: 3 }],
    [[0, 2, 3], 3, undefined],
    [[4, 5, 7], 2, { start: 4, end: 6 }],
    [[], 1, undefined],
  ])("placedSpan of %j and %i is %j", (offsets, length, span) => {
    expect(placedSpan({ text: "abc".slice(0, offsets.length), offsets }, length)).toEqual(span);
  });

  it("writtenSpan of split characters is undefined and of characters in one piece is their span", () => {
    const split = { ...word("abc", 0), written: [0, 1, 3] };

    expect(writtenSpan(split, 0, 2)).toEqual({ start: 0, end: 2 });
    expect(writtenSpan(split, 0, 3)).toBeUndefined();
  });
});
