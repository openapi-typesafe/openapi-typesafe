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

describe("planCalledMakefiles", () => {
  it("planCalledMakefiles reads the Makefiles of a project and what they replace", async () => {
    const files = new InMemoryProjectFiles(
      {
        Makefile: lines("override GEN := npx openapi-typescript"),
        "api/GNUmakefile": lines("GEN := x"),
        "build.mk": lines("override FLAGS := -x"),
        "notes.txt": lines("override GEN := x"),
        "big/Makefile": lines("override GEN := x"),
      },
      [],
      { unreadable: { "big/Makefile": { kind: "not-utf-8" } } },
    );

    const called = await planCalledMakefiles(
      ["Makefile", "api/GNUmakefile", "build.mk", "notes.txt", "big/Makefile"],
      files,
    );

    expect([...(called.replacedNames("Makefile") ?? [])]).toEqual(["GEN"]);
    expect(called.replacedNames("api/GNUmakefile")?.size).toBe(0);
    expect([...(called.replacedNames("build.mk") ?? [])]).toEqual(["FLAGS"]);
    expect(called.replacedNames("notes.txt")).toBeUndefined();
    expect(called.replacedNames("big/Makefile")).toBeUndefined();
  });
});

describe("migrateProject and sub-makes", () => {
  it("migrateProject renames flags a recipe appends for a Makefile of the project", async () => {
    const files = new InMemoryProjectFiles({
      Makefile: lines(
        "export GEN := npx openapi-typescript",
        "all:",
        "\t$(MAKE) -C api GEN+=-it",
        "\t$(MAKE) -C web GEN+=-it",
      ),
      "api/Makefile": lines("gen:", "\t$(GEN) api.yaml"),
      "web/Makefile": lines("override GEN := mytool", "gen:", "\t$(GEN) web.yaml"),
    });
    const dependencies = {
      files,
      rewriter: new StubCallbackRewriter(),
      scanner: new QuotedStringScanner(),
      readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
      logger: new RecordingLogger(),
    };

    await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(files.files.get("Makefile")).toBe(
      lines(
        "export GEN := npx openapi-typesafe",
        "all:",
        "\t$(MAKE) -C api GEN+=--immutable",
        "\t$(MAKE) -C web GEN+=-it",
      ),
    );
  });
});
