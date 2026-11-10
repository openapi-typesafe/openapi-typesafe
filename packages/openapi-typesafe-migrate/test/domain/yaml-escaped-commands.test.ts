import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const step = (run: string) => lines("jobs:", "  a:", "    steps:", `      - run: ${run}`);

describe("migrateYamlCommands and quoted values with escapes", () => {
  it.each([
    [
      String.raw`"echo \"Don't edit\" && npx openapi-typescript api.yaml -it"`,
      String.raw`"echo \"Don't edit\" && npx openapi-typesafe api.yaml --immutable"`,
    ],
    [
      String.raw`"echo a\nnpx openapi-typescript api.yaml -it"`,
      String.raw`"echo a\nnpx openapi-typesafe api.yaml --immutable"`,
    ],
    [
      "'echo ''a b'' && npx openapi-typescript api.yaml -it'",
      "'echo ''a b'' && npx openapi-typesafe api.yaml --immutable'",
    ],
  ])("migrateYamlCommands reads %s as the value the shell gets", (written, migrated) => {
    const text = step(written);

    const result = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(result.text).toBe(step(migrated));
    expect(result.changes.map((change) => (change as { location?: string }).location)).toContain(
      "ci.yml:4",
    );
  });

  it("migrateYamlCommands leaves a quoted value with escapes and no generator as written", () => {
    // `\x41` is written as `A` when the value is quoted anew, so a rewrite would show.
    const text = step(String.raw`"echo \"openapi-typescript\" \x41 done"`);

    expect(migrateYamlCommands(text, "ci.yml", stringsOf(text)).text).toBe(text);
  });

  it("migrateYamlCommands reads an env value with escapes as its value", () => {
    const text = lines(
      "env:",
      String.raw`  GEN: "npx \"openapi-typescript\""`,
      "jobs:",
      "  a:",
      "    steps:",
      "      - run: $GEN api.yaml -it",
    );

    const result = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(result.text).toContain(String.raw`  GEN: "npx \"openapi-typesafe\""`);
    expect(result.text).toContain("      - run: $GEN api.yaml --immutable");
  });
});
