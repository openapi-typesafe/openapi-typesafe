import { describe, expect, it } from "vitest";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const context = { version: "1.0.0", rewriter: new StubCallbackRewriter() };

describe("fileMigrationFor", () => {
  it.each([
    "package.json",
    "apps/web/package.json",
    "pnpm-workspace.yaml",
    "src/a.ts",
    "src/a.vue",
    "scripts/gen.sh",
    ".github/workflows/ci.yml",
    "Makefile",
    "justfile",
    "docker/Dockerfile",
  ])("fileMigrationFor has a migration for %s", (path) => {
    expect(fileMigrationFor(path)).toBeTypeOf("function");
  });

  it.each(["README.md", "src/a.json", ".env", "LICENSE", "a.d", "pnpm-lock.yaml", "app/yarn.lock"])(
    "fileMigrationFor has no migration for %s",
    (path) => {
      expect(fileMigrationFor(path)).toBeUndefined();
    },
  );

  it("fileMigrationFor joins the findings of the specifier rename and the rewriter", () => {
    const rewriter = new StubCallbackRewriter({
      "a.ts": {
        text: "rewritten",
        changes: [{ kind: "transform-rewritten", line: 2 }],
        manualSteps: [{ kind: "legacy-callback", line: 3, callback: "postTransform" }],
      },
    });
    const migrate = fileMigrationFor("a.ts");

    const migration = migrate?.('import "openapi-fetch/x";', "a.ts", {
      version: "1.0.0",
      rewriter,
    });

    expect(migration?.text).toBe("rewritten");
    expect(migration?.changes.map((change) => change.kind)).toEqual([
      "specifier-renamed",
      "transform-rewritten",
    ]);
    expect(migration?.manualSteps.map((step) => step.kind)).toEqual([
      "deep-import",
      "legacy-callback",
    ]);
  });

  it("fileMigrationFor migrates the catalogs of pnpm-workspace.yaml, not its commands", () => {
    const migration = fileMigrationFor("pnpm-workspace.yaml")?.(
      "catalog:\n  openapi-fetch: 1.0.0\n",
      "pnpm-workspace.yaml",
      context,
    );

    expect(migration?.text).toBe("catalog:\n  openapi-typesafe-fetch: 1.0.0\n");
  });
});
