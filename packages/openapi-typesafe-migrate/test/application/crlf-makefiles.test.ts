import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateProject } from "../../src/application/migrate-project.js";
import { makeText } from "../../src/domain/make-line-ends.js";
import { readMakeLines } from "../../src/domain/make-lines.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const withCrlf = (text: string): string => text.replaceAll("\n", "\r\n");

/** The text `$(name)` of a make reference. */
const use = (name: string): string => ["$(", name, ")"].join("");

async function migrated(project: Readonly<Record<string, string>>) {
  const files = new InMemoryProjectFiles(project);
  const dependencies = {
    files,
    rewriter: new StubCallbackRewriter(),
    scanner: new QuotedStringScanner(),
    readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
    logger: new RecordingLogger(),
  };
  const result = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });
  const findings = result.files.map(({ path, changes, manualSteps }) => ({
    path,
    changes,
    manualSteps,
  }));
  return { files: Object.fromEntries(files.files), findings };
}

const projectWithCrlf = (project: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(project).map(([path, text]) => [path, withCrlf(text)]));

const RECIPE = `\t${use("GEN")} api.yaml -it`;

describe("migrateProject and Makefiles with CR LF line ends", () => {
  it.each([
    [
      "an include",
      {
        Makefile: lines("include tools.mk", "gen:", RECIPE),
        "tools.mk": lines("GEN := npx openapi-typescript"),
      },
    ],
    [
      "an include continued by a backslash",
      {
        Makefile: lines("include \\", "  tools.mk", "gen:", RECIPE),
        "tools.mk": lines("GEN := npx openapi-typescript"),
      },
    ],
    [
      "a define",
      { Makefile: lines("define GEN", "npx openapi-typescript", "endef", "gen:", RECIPE) },
    ],
    [
      "an eval template",
      {
        Makefile: lines(
          "GEN := npx openapi-typescript",
          "define TPL",
          "$(1): ; $$(GEN) $(1).yaml -it",
          "endef",
          "$(eval $(call TPL,a))",
        ),
      },
    ],
    [
      "a recipe continued by a backslash",
      { Makefile: lines("gen:", "\tnpx openapi-typescript \\", "\t  a.yaml -it") },
    ],
    [
      "a comment continued by a backslash",
      {
        Makefile: lines(
          "# note \\",
          "openapi-typescript -it",
          "gen:",
          "\tnpx openapi-typescript a.yaml -it",
        ),
      },
    ],
    [
      "an included file read with the includer's value",
      {
        Makefile: lines("GEN := npx openapi-typescript", "include mk/gen.mk"),
        "mk/gen.mk": lines("gen:", RECIPE),
      },
    ],
  ])("migrateProject reads %s with CR LF as with LF and keeps CR LF", async (_, project) => {
    const expected = await migrated(project);

    const found = await migrated(projectWithCrlf(project));

    expect(found.files).toEqual(projectWithCrlf(expected.files));
    expect(found.findings).toEqual(expected.findings);
    expect(expected.findings.flatMap(({ changes }) => changes).length).toBeGreaterThan(0);
  });
});

describe("readMakeLines and the characters that split make's words", () => {
  it("readMakeLines splits an include at a CR that no LF follows", () => {
    const [include] = readMakeLines("include a.mk\rb.mk\n").includes;

    expect(include?.paths.map(({ text }) => text)).toEqual(["a.mk", "b.mk"]);
  });
});

describe("makeText", () => {
  it("makeText drops the CR of each CR LF and places every offset where it is written", () => {
    const written = "a\r\nbc\r\n\r\nd\re\n";

    const read = makeText(written);

    expect(read.text).toBe("a\nbc\n\nd\re\n");
    const placed = Array.from(read.text, (_, offset) => written[read.writtenOffset(offset)]);
    expect(placed.join("")).toBe(read.text);
  });
});
