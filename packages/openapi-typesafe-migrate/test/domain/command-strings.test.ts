import { describe, expect, it } from "vitest";
import { commandStringSteps } from "../../src/domain/command-strings.js";
import type { SourceString } from "../../src/domain/source-migration.js";

/** The strings of `text` in double quotes, none of them a module specifier unless named. */
function strings(text: string, specifiers: readonly string[] = []): SourceString[] {
  return [...text.matchAll(/"([^"]*)"/g)].map((match) => {
    const value = match[1] as string;
    const start = match.index + 1;
    return {
      start,
      end: start + value.length,
      value,
      isModuleSpecifier: specifiers.includes(value),
    };
  });
}

describe("commandStringSteps", () => {
  it("commandStringSteps reports a string that runs the generator, with the new command", () => {
    const text = 'import "x";\nexecSync("npx openapi-typescript a.yaml -it");\n';

    expect(commandStringSteps(text, strings(text))).toEqual([
      { kind: "command-string", line: 2, to: "npx openapi-typesafe a.yaml --immutable" },
    ]);
  });

  it("commandStringSteps leaves module specifiers, package names and other strings", () => {
    const text = '"openapi-typescript";"npx openapi-typescript a";"npm run x";"openapi-fetch"';

    expect(commandStringSteps(text, strings(text, ["npx openapi-typescript a"]))).toEqual([]);
  });
});
