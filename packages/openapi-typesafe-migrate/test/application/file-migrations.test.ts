import { describe, expect, it } from "vitest";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const scanner = new QuotedStringScanner();
const context = { version: "1.0.0", rewriter: new StubCallbackRewriter(), scanner };

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
    "Justfile",
    "docker/Dockerfile",
    "build/rules.mk",
    ".husky/pre-commit",
    "apps/web/.husky/pre-push",
    "apps/api/project.json",
    "deno.json",
    "tools/deno.jsonc",
    ".github/dependabot.yml",
    "package.yaml",
  ])("fileMigrationFor has a migration for %s", (path) => {
    expect(fileMigrationFor(path)).toBeTypeOf("function");
  });

  it.each([
    "README.md",
    "src/a.json",
    ".env",
    "LICENSE",
    "a.d",
    "pnpm-lock.yaml",
    "app/yarn.lock",
    ".husky/_/pre-commit",
  ])("fileMigrationFor has no migration for %s", (path) => {
    expect(fileMigrationFor(path)).toBeUndefined();
  });

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
      scanner,
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

  it("fileMigrationFor migrates only the commands of a YAML file, not its other values", () => {
    const text = "info:\n  description: openapi-typescript\nrun: openapi-typescript a\n";

    const migration = fileMigrationFor("api.yaml")?.(text, "api.yaml", context);

    expect(migration?.text).toBe(
      "info:\n  description: openapi-typescript\nrun: openapi-typesafe a\n",
    );
  });

  it("fileMigrationFor renames every package of a Dependabot config", () => {
    const migration = fileMigrationFor(".github/dependabot.yml")?.(
      "- dependency-name: openapi-fetch\n",
      ".github/dependabot.yml",
      context,
    );

    expect(migration?.text).toBe("- dependency-name: openapi-typesafe-fetch\n");
  });

  it("fileMigrationFor migrates the commands of husky hooks, Nx projects and Deno tasks", () => {
    const run = (path: string, text: string): string | undefined =>
      fileMigrationFor(path)?.(text, path, context).text;

    expect(run(".husky/pre-commit", "npx openapi-typescript a\n")).toBe("npx openapi-typesafe a\n");
    expect(run("project.json", '{"targets":{"g":{"command":"openapi-typescript a"}}}')).toBe(
      '{"targets":{"g":{"command":"openapi-typesafe a"}}}',
    );
    expect(run("deno.json", '{"tasks":{"g":"deno run npm:openapi-typescript a"}}')).toBe(
      '{"tasks":{"g":"deno run npm:openapi-typesafe a"}}',
    );
    expect(run("package.yaml", "scripts:\n  g: openapi-typescript a\n")).toBe(
      "scripts:\n  g: openapi-typesafe a\n",
    );
  });
});
