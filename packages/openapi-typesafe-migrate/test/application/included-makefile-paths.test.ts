import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { planCalledMakefiles } from "../../src/application/called-makefiles.js";
import { migrateProject } from "../../src/application/migrate-project.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text `$(name)` of a make reference. */
const use = (name: string): string => ["$(", name, ")"].join("");

const GEN_TOOL = lines("GEN := npx openapi-typescript");
const GEN_RECIPE = lines("types:", `\t${use("GEN")} api.yaml -it`);
const RENAMED_RECIPE = GEN_RECIPE.replace("-it", "--immutable");
const MANIFEST = JSON.stringify({ devDependencies: { "openapi-typescript": "^7.0.0" } });

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
  const stepsOf = (path: string) =>
    result.files.find((file) => file.path === path)?.manualSteps.map((step) => step.kind) ?? [];
  return { files: files.files, stepsOf };
}

const plan = (project: Readonly<Record<string, string>>) =>
  planCalledMakefiles(Object.keys(project), new InMemoryProjectFiles(project));

/**
 * A chain of 300 includes plans in tens of milliseconds; reading one file of it a round takes
 * seconds. The limit leaves room for a slow machine and still tells the two apart.
 */
const CHAIN_TIME_LIMIT_MS = 1500;

/** Project files in memory that record each path read, in order. */
class ReadCountingFiles extends InMemoryProjectFiles {
  readonly reads: string[] = [];

  override read(path: string) {
    this.reads.push(path);
    return super.read(path);
  }
}

describe("migrateProject and the files an include names by a wildcard or a variable", () => {
  it.each([
    ["a wildcard", "include mk/*.mk", { "mk/tools.mk": GEN_TOOL, "mk/other.mk": lines("X := 1") }],
    ["a variable", `MK := mk\ninclude ${use("MK")}/tools.mk`, { "mk/tools.mk": GEN_TOOL }],
    [
      "a variable that an included file sets",
      `include dirs.mk\ninclude ${use("MK")}/tools.mk`,
      { "dirs.mk": lines("MK := mk"), "mk/tools.mk": GEN_TOOL },
    ],
    [
      "a nested wildcard",
      "include mk/*.mk",
      { "mk/a.mk": lines("include mk/b*.mk"), "mk/b1.mk": GEN_TOOL },
    ],
  ])("migrateProject renames the flags after a file that %s names", async (_, include, files) => {
    const result = await migrated({ Makefile: `${include}\n${GEN_RECIPE}`, ...files });

    expect(result.files.get("Makefile")).toBe(`${include}\n${RENAMED_RECIPE}`);
  });

  it("migrateProject keeps the flags when a later file of a wildcard sets another program", async () => {
    const project = {
      Makefile: `include mk/*.mk\n${GEN_RECIPE}`,
      "mk/a.mk": GEN_TOOL,
      "mk/b.mk": lines("GEN := grep"),
    };

    const result = await migrated(project);

    expect(result.files.get("Makefile")).toBe(project.Makefile);
    expect(result.stepsOf("Makefile")).toEqual([]);
  });

  it.each([
    ["a variable without a known value", `include ${use("TOOLS")}/tools.mk`],
    ["a missing file", "-include .env"],
    ["a wildcard that matches no file", "-include local/*.mk"],
  ])("migrateProject reads a Makefile that includes %s", async (_, include) => {
    const text = `${include}\n${GEN_RECIPE}`;

    const result = await migrated({ "package.json": MANIFEST, Makefile: text });

    expect(result.files.get("Makefile")).toBe(text);
    expect(result.stepsOf("Makefile")).toEqual(["variable-not-only-generator"]);
  });

  it("migrateProject reads a file that a Makefile with an unread include includes", async () => {
    const project = { Makefile: "-include .env gen.mk\n", "gen.mk": GEN_RECIPE };

    const result = await migrated({ "package.json": MANIFEST, ...project });

    expect(result.stepsOf("gen.mk")).toEqual(["variable-not-only-generator"]);
  });

  it("migrateProject leaves a Makefile that names nothing and includes known files", async () => {
    const project = { Makefile: `include tools.mk\n${GEN_RECIPE}`, "tools.mk": lines("X := 1") };

    const result = await migrated({ "package.json": MANIFEST, ...project });

    expect(result.stepsOf("Makefile")).toEqual([]);
  });
});

describe("planCalledMakefiles and the files an include names", () => {
  it("planCalledMakefiles reads the files of a wildcard and of a variable", async () => {
    const called = await plan({
      Makefile: lines("include mk/*.mk", `include ${use("DIR")}/c.mk`),
      "mk/a.mk": lines("DIR := sub"),
      "mk/b.mk": lines("X := 1"),
      "sub/c.mk": lines("Y := 1"),
    });

    expect([...called.includedFiles].sort()).toEqual(["mk/a.mk", "mk/b.mk", "sub/c.mk"]);
    expect(called.readersOf("sub/c.mk")).toEqual(["Makefile"]);
    expect([...called.unreadIncludes]).toEqual([]);
  });

  it("planCalledMakefiles follows the includes of a file it cannot put in", async () => {
    const called = await plan({
      Makefile: lines("include a.mk missing.mk"),
      "a.mk": lines("include b.mk"),
      "b.mk": lines("X := 1"),
    });

    expect(called.readersOf("b.mk")).toEqual(["Makefile"]);
    expect([...called.unreadIncludes]).toEqual(["Makefile"]);
  });

  it("planCalledMakefiles reads no file that the project's list leaves out", async () => {
    const project = { Makefile: lines("-include .env"), ".env": lines("GEN := grep") };

    const called = await planCalledMakefiles(["Makefile"], new InMemoryProjectFiles(project));

    expect(called.includedText(".env")).toBeUndefined();
    expect([...called.unreadIncludes]).toEqual(["Makefile"]);
  });

  it("planCalledMakefiles gives the Makefiles whose include is not known", async () => {
    const called = await plan({
      Makefile: lines("include tools.mk"),
      "tools.mk": lines(`include ${use("X")}.mk`),
      "api/Makefile": lines("X := 1"),
    });

    expect([...called.unreadIncludes].sort()).toEqual(["Makefile", "tools.mk"]);
  });

  it("planCalledMakefiles reads the file a value names after an earlier file changes it", async () => {
    const called = await plan({
      Makefile: lines("D := mk", "include x.mk", `include ${use("D")}/a.mk`),
      "x.mk": lines("D := other"),
      "mk/a.mk": lines("X := 1"),
      "other/a.mk": lines("Y := 1"),
    });

    expect([...called.includedFiles].sort()).toEqual(["other/a.mk", "x.mk"]);
    expect(called.readersOf("mk/a.mk")).toEqual(["mk/a.mk"]);
  });

  it("planCalledMakefiles keeps a recipe going past an include that names no file", async () => {
    const called = await plan({
      Makefile: lines(
        ...["D := a", "EMPTY :=", "all:", "\t@echo all", `include ${use("EMPTY")}`],
        ...["\tD := b", `include ${use("D")}.mk`],
      ),
      "a.mk": lines("X := 1"),
      "b.mk": lines("Y := 1"),
    });

    expect([...called.includedFiles]).toEqual(["a.mk"]);
  });

  it("planCalledMakefiles reads an included file with the values of the Makefile", async () => {
    const called = await plan({
      Makefile: lines("X := b", "include a.mk"),
      "a.mk": lines(`include ${use("X")}.mk`),
      "b.mk": lines("Y := 1"),
    });

    expect(called.readersOf("b.mk")).toEqual(["Makefile"]);
    expect([...called.unreadIncludes]).toEqual(["a.mk"]);
  });

  it("planCalledMakefiles reads each named file once, also one it cannot read", async () => {
    const files = new ReadCountingFiles({
      Makefile: lines("include a.mk", "include gone.mk", "include b.mk"),
      "a.mk": lines("include b.mk gone.mk"),
      "b.mk": lines("X := 1"),
    });

    await planCalledMakefiles(["Makefile", "a.mk", "b.mk", "gone.mk"], files);

    expect(files.reads.sort()).toEqual(["Makefile", "a.mk", "b.mk", "gone.mk"]);
  });

  it("planCalledMakefiles reads a long chain of includes by a variable in few rounds", async () => {
    const count = 300;
    const includes = Array.from(
      { length: count },
      (_, index) => `include ${use("D")}/f${index}.mk`,
    );
    const project: Record<string, string> = { Makefile: lines("D := mk", ...includes) };
    for (let index = 0; index < count; index++) {
      project[`mk/f${index}.mk`] = lines(`V${index} := ${index}`);
    }
    const start = performance.now();

    const called = await plan(project);

    expect(called.includedFiles.size).toBe(count);
    expect(performance.now() - start).toBeLessThan(CHAIN_TIME_LIMIT_MS);
  });
});
