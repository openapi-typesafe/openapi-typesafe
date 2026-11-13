import { describe, expect, it } from "vitest";
import { functionCommands, maskExpansions } from "../../src/domain/make-expansions.js";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
/** A make expansion such as `$(GEN)`, built so that no template literal holds `${`. */
const make = (body: string): string => ["$", "(", body, ")"].join("");

/** Each command as its words as written, and where its first word starts. */
const commandsOf = (text: string): [number, string[]][] =>
  functionCommands(text).map((command) => [
    command[0]?.start ?? -1,
    command.map((word) => text.slice(word.start, word.end)),
  ]);

describe("functionCommands", () => {
  it("functionCommands reads the arguments that a function can give as its value", () => {
    const text = `${make(`if ${make("A")},npx openapi-typescript,${make("B")}`)} x`;

    expect(commandsOf(text)).toEqual([
      [text.indexOf("npx"), ["npx", "openapi-typescript"]],
      [text.lastIndexOf(make("B")), [make("B")]],
    ]);
  });

  it("functionCommands reads every argument of or and and, and nested calls", () => {
    const nested = make(`and a,${make("or b , c d")}`);

    expect(commandsOf(`x ${nested}`).map(([, words]) => words)).toEqual([
      ["a"],
      [make("or b , c d")],
      ["b"],
      ["c", "d"],
    ]);
  });

  it("functionCommands keeps the commas of a nested call and reads braces as a call", () => {
    const text = `\${or ${make("subst a,b,c")},openapi-typescript}`;

    expect(commandsOf(text).map(([, words]) => words)).toEqual([
      [make("subst a,b,c")],
      ["openapi-typescript"],
    ]);
  });

  it("functionCommands leaves other functions, references and a doubled dollar", () => {
    const text = `${make("shell openapi-typescript")} ${make("or")} $$(or a,b) ${make("GEN")}`;

    expect(functionCommands(text)).toEqual([]);
  });

  it("maskExpansions turns each expansion into one word and keeps a doubled dollar", () => {
    expect(maskExpansions(`${make("or a,b")} $$x \${G} $(open`)).toBe("$________ $$x $___ $(open");
  });
});

describe("migrateMakefile and make functions", () => {
  it("migrateMakefile renames the generator inside a function and reports the flags after it", () => {
    const program = make(`or ${make("GEN")},npx openapi-typescript`);
    const text = lines("gen:", `\t${program} b.yaml -o x.ts`, `\t${program} b.yaml -it`);

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(text.replaceAll("openapi-typescript", "openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "Makefile:3",
        variable: program,
        flags: ["-it"],
      },
    ]);
  });

  it("migrateMakefile renames the generator in a function an assignment holds", () => {
    const text = lines(`GEN := ${make(`if ${make("X")},${make("X")},openapi-typescript`)}`);

    expect(migrateMakefile(text, "Makefile").text).toBe(
      text.replace("openapi-typescript", "openapi-typesafe"),
    );
  });
});
