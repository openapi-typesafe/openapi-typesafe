import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { planCalledMakefiles } from "../../src/application/called-makefiles.js";
import { migrateProject, type ProjectMigration } from "../../src/application/migrate-project.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text `$(name)` of a make reference. */
const use = (name: string): string => ["$(", name, ")"].join("");

const GEN_TOOL = lines("GEN := npx openapi-typescript");
const GEN_RECIPE = lines("types:", `\t${use("GEN")} api.yaml -it`);
const RENAMED_RECIPE = lines("types:", `\t${use("GEN")} api.yaml --immutable`);

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
  return { files: files.files, result };
}

const stepsOf = (result: ProjectMigration): string[][] =>
  result.files.map((file) => [file.path, ...file.manualSteps.map((step) => step.kind)]);

describe("planCalledMakefiles and the Makefiles that read a file", () => {
  it("planCalledMakefiles gives the Makefiles make runs that read each included file", async () => {
    const project = {
      Makefile: lines("include a.mk"),
      "a.mk": lines("include b.mk"),
      "b.mk": lines("A = 1"),
      "api/Makefile": lines("include ../b.mk"),
      "config.make": lines("B = 2"),
      "web/Makefile": lines("include ../config.make"),
    };

    const called = await planCalledMakefiles(
      Object.keys(project),
      new InMemoryProjectFiles(project),
    );

    expect(called.readersOf("b.mk")).toEqual(["Makefile", "api/Makefile"]);
    expect(called.readersOf("a.mk")).toEqual(["Makefile"]);
    expect(called.readersOf("Makefile")).toEqual(["Makefile"]);
    expect(called.readersOf("config.make")).toEqual(["web/Makefile"]);
    expect([...called.includedFiles].sort()).toEqual(["a.mk", "b.mk", "config.make"]);
  });

  it("planCalledMakefiles counts an included Makefile of a default name as run too", async () => {
    const project = { Makefile: lines("include api/Makefile"), "api/Makefile": lines("A = 1") };

    const called = await planCalledMakefiles(
      Object.keys(project),
      new InMemoryProjectFiles(project),
    );

    expect(called.readersOf("api/Makefile")).toEqual(["Makefile", "api/Makefile"]);
  });
});

describe("migrateProject and Makefiles linked by include", () => {
  it("migrateProject renames the flags of a Makefile whose included file sets the generator", async () => {
    const { files } = await migrated({
      Makefile: `include tools.mk\n${GEN_RECIPE}`,
      "tools.mk": GEN_TOOL,
    });

    expect(files.get("Makefile")).toBe(`include tools.mk\n${RENAMED_RECIPE}`);
    expect(files.get("tools.mk")).toBe(lines("GEN := npx openapi-typesafe"));
  });

  it("migrateProject reads the files of an include that a backslash continues", async () => {
    const { files } = await migrated({
      Makefile: `include \\\n  tools.mk\n${GEN_RECIPE}`,
      "tools.mk": GEN_TOOL,
    });

    expect(files.get("Makefile")).toBe(`include \\\n  tools.mk\n${RENAMED_RECIPE}`);
  });

  it.each([["config.make"], [".env"], ["mk/Makefile.common"]])(
    "migrateProject migrates the included file %s as a Makefile",
    async (path) => {
      const { files } = await migrated({
        Makefile: `-include ${path}\n${GEN_RECIPE}`,
        [path]: GEN_TOOL,
      });

      expect(files.get(path)).toBe(lines("GEN := npx openapi-typesafe"));
      expect(files.get("Makefile")).toBe(`-include ${path}\n${RENAMED_RECIPE}`);
    },
  );

  it("migrateProject renames the flags of an included recipe by the includer's value", async () => {
    const { files } = await migrated({
      Makefile: `${GEN_TOOL}include mk/gen.mk\n`,
      "mk/gen.mk": GEN_RECIPE,
    });

    expect(files.get("mk/gen.mk")).toBe(RENAMED_RECIPE);
  });

  it("migrateProject renames the recipes of two included files each in its own file", async () => {
    const longer = lines("# the recipe of b.mk", "", `${GEN_RECIPE.trimEnd()}`);

    const { files } = await migrated({
      Makefile: `${GEN_TOOL}include a.mk\ninclude b.mk\n`,
      "a.mk": GEN_RECIPE,
      "b.mk": longer,
    });

    expect([files.get("a.mk"), files.get("b.mk")]).toEqual([
      RENAMED_RECIPE,
      longer.replace("-it", "--immutable"),
    ]);
  });

  it("migrateProject renames an included recipe through a file between them", async () => {
    const { files } = await migrated({
      Makefile: `${GEN_TOOL}include a.mk\n`,
      "a.mk": lines("include b.mk"),
      "b.mk": GEN_RECIPE,
    });

    expect(files.get("b.mk")).toBe(RENAMED_RECIPE);
  });

  it("migrateProject reports an included recipe that two includers read differently", async () => {
    const { files, result } = await migrated({
      Makefile: `${GEN_TOOL}include mk/gen.mk\n`,
      "api/Makefile": lines("GEN := grep", "include ../mk/gen.mk"),
      "mk/gen.mk": GEN_RECIPE,
    });

    expect(files.get("mk/gen.mk")).toBe(GEN_RECIPE);
    expect(result.files.find((file) => file.path === "mk/gen.mk")?.manualSteps).toEqual([
      {
        kind: "included-text-differs",
        location: "mk/gen.mk:2",
        readers: ["Makefile", "api/Makefile"],
        renames: [{ from: "-it", to: "--immutable" }],
      },
    ]);
  });

  it("migrateProject keeps an edit of an included file that every includer makes", async () => {
    const recipe = lines("GEN2 := npx openapi-typescript", "types:", `\t${use("GEN")} a.yaml -it`);

    const { files } = await migrated({
      Makefile: `${GEN_TOOL}include mk/gen.mk\n`,
      "api/Makefile": lines("GEN := grep", "include ../mk/gen.mk"),
      "mk/gen.mk": recipe,
    });

    expect(files.get("mk/gen.mk")).toBe(recipe.replace("openapi-typescript", "openapi-typesafe"));
  });

  it("migrateProject reports an included Makefile that make also runs alone", async () => {
    const { files, result } = await migrated({
      Makefile: `${GEN_TOOL}include api/Makefile\n`,
      "api/Makefile": GEN_RECIPE,
    });

    expect(files.get("api/Makefile")).toBe(GEN_RECIPE);
    expect(stepsOf(result)).toContainEqual([
      "api/Makefile",
      "variable-not-only-generator",
      "included-text-differs",
    ]);
  });

  it("migrateProject leaves a Makefile that no file naming an old package links to", async () => {
    const { files, result } = await migrated({
      Makefile: `${GEN_TOOL}${GEN_RECIPE}`,
      "other.mk": GEN_RECIPE,
    });

    expect(files.get("other.mk")).toBe(GEN_RECIPE);
    expect(result.files.map((file) => file.path)).toEqual(["Makefile"]);
  });

  it("migrateProject reads an included file alone when its include line is not read", async () => {
    const { files, result } = await migrated({
      Makefile: `include tools.mk missing.mk\n${GEN_RECIPE}`,
      "tools.mk": GEN_TOOL,
    });

    expect(files.get("tools.mk")).toBe(lines("GEN := npx openapi-typesafe"));
    expect(stepsOf(result)).toContainEqual(["Makefile", "variable-not-only-generator"]);
  });
});
