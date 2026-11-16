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

describe("planCalledMakefiles and included files", () => {
  it("planCalledMakefiles reads the project files a Makefile includes, from its folder", async () => {
    const files = new InMemoryProjectFiles({
      "api/Makefile": lines("include mk/vars", "-include ../outside.mk", "include missing.mk"),
      "api/mk/vars": lines("include mk/flags", "override GEN := x"),
      "api/mk/flags": lines("FLAGS = -x"),
      "outside.mk": lines("A = 1"),
      "notes.txt": lines("B = 2"),
    });

    const called = await planCalledMakefiles(
      ["api/Makefile", "api/mk/vars", "api/mk/flags", "outside.mk", "notes.txt"],
      files,
    );

    expect(called.includedText("api/mk/vars")).toBe(lines("include mk/flags", "override GEN := x"));
    expect(called.includedText("api/mk/flags")).toBe(lines("FLAGS = -x"));
    expect(called.includedText("outside.mk")).toBe(lines("A = 1"));
    expect(called.includedText("notes.txt")).toBeUndefined();
    expect(called.includedText("api/missing.mk")).toBeUndefined();
    expect([...(called.replacedNames("api/Makefile") ?? [])]).toEqual(["GEN"]);
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
