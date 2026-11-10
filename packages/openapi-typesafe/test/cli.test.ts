import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import stripAnsi from "strip-ansi";
import type { TestCase } from "./test-helpers.js";

const root = new URL("../", import.meta.url);
const cwd = os.platform() === "win32" ? fileURLToPath(root) : root; // execa bug: fileURLToPath required on Windows
const cmd = "./bin/cli.js";
const TIMEOUT = 90_000;
/**
 * Every test spawns the CLI, which loads Redocly and TypeScript before its first output: well
 * under a second here, but more than vitest's default 5 s on a busy macOS Intel CI runner.
 */
const SPAWN_TIMEOUT_MS = 30_000;

describe("CLI", { timeout: SPAWN_TIMEOUT_MS }, () => {
  const tests: TestCase<string[]>[] = [
    [
      "snapshot > GitHub API",
      {
        given: ["./examples/github-api.yaml"],
        want: new URL("./examples/github-api.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > GitHub API (immutable)",
      {
        given: ["./examples/github-api.yaml", "--immutable"],
        want: new URL("./examples/github-api-immutable.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > GitHub API (types + immutable)",
      {
        given: ["./examples/github-api.yaml", "--immutable", "--export-type"],
        want: new URL("./examples/github-api-export-type-immutable.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > GitHub API (root types)",
      {
        given: ["./examples/github-api.yaml", "--root-types"],
        want: new URL("./examples/github-api-root-types.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > GitHub API (next)",
      {
        given: ["./examples/github-api-next.yaml"],
        want: new URL("./examples/github-api-next.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > Octokit GHES 3.6 Diff to API",
      {
        given: ["./examples/octokit-ghes-3.6-diff-to-api.json"],
        want: new URL("./examples/octokit-ghes-3.6-diff-to-api.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > Stripe API",
      {
        given: ["./examples/stripe-api.yaml"],
        want: new URL("./examples/stripe-api.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > DigitalOcean",
      {
        given: ["./examples/digital-ocean-api/DigitalOcean-public.v2.yaml"],
        want: new URL("./examples/digital-ocean-api.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > DigitalOcean (all output fixes)",
      {
        given: ["./examples/digital-ocean-api/DigitalOcean-public.v2.yaml", "--fix", "all"],
        want: new URL("./examples/digital-ocean-api-fix-all.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > OpenAPI 3.2 features",
      {
        given: ["./examples/openapi-3-2.yaml"],
        want: new URL("./examples/openapi-3-2.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > enum root types filtering",
      {
        given: ["./examples/enum-root-types.yaml", "--root-types", "--root-types-no-schema-prefix", "--enum"],
        want: new URL("./examples/enum-root-types.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > unevaluatedProperties (unevaluated-properties fix)",
      {
        given: ["./examples/unevaluated-properties.yaml", "--fix", "unevaluated-properties"],
        want: new URL("./examples/unevaluated-properties.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > discriminator mapping values (discriminator-values fix)",
      {
        given: ["./examples/discriminator-values.yaml", "--fix", "discriminator-values"],
        want: new URL("./examples/discriminator-values.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > root types of one name (root-type-numbering fix)",
      {
        given: [
          "./examples/root-type-numbering.yaml",
          "--root-types",
          "--root-types-no-schema-prefix",
          "--fix",
          "root-type-numbering",
        ],
        want: new URL("./examples/root-type-numbering.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > anyOf with sibling properties (anyof-properties fix)",
      {
        given: ["./examples/anyof-properties.yaml", "--fix", "anyof-properties"],
        want: new URL("./examples/anyof-properties.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > --array-length tuples (array-length-tuples fix)",
      {
        given: ["./examples/array-length-tuples.yaml", "--array-length", "--fix", "array-length-tuples"],
        want: new URL("./examples/array-length-tuples.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
    [
      "snapshot > overlapping --path-params-as-types keys",
      {
        given: ["./examples/path-params-overlaps.yaml", "--path-params-as-types"],
        want: new URL("./examples/path-params-overlaps.ts", root),
        ci: { timeout: TIMEOUT },
      },
    ],
  ];

  for (const [testName, { given, want, ci }] of tests) {
    test.skipIf(ci?.skipIf)(
      testName,
      async () => {
        const { stdout } = await execa(cmd, given, { cwd, stripFinalNewline: false });
        if (want instanceof URL) {
          await expect(stdout).toMatchFileSnapshot(fileURLToPath(want));
        } else {
          expect(stdout).toBe(`${want}\n`);
        }
      },
      ci?.timeout,
    );
  }

  test(
    "stdin",
    async () => {
      const input = fs.readFileSync(new URL("./examples/stripe-api.yaml", root));
      const { stdout } = await execa(cmd, { input, cwd, stripFinalNewline: false });
      await expect(stdout).toMatchFileSnapshot(fileURLToPath(new URL("./examples/stripe-api.ts", root)));
    },
    TIMEOUT,
  );

  describe("flags", () => {
    test("--help", async () => {
      const { stdout } = await execa(cmd, ["--help"], { cwd });
      expect(stdout).toEqual(expect.stringMatching(/^Usage\n\s+\$ openapi-typesafe \[input\] \[options\]/));
    });

    test("--version", async () => {
      const { stdout } = await execa(cmd, ["--version"], { cwd });
      expect(stdout).toEqual(expect.stringMatching(/^v[\d.]+(-.*)?$/));
    });

    test(
      "--properties-required-by-default",
      async () => {
        const { stdout } = await execa(cmd, ["--properties-required-by-default=true", "./examples/github-api.yaml"], {
          cwd,
          stripFinalNewline: false,
        });
        await expect(stdout).toMatchFileSnapshot(fileURLToPath(new URL("./examples/github-api-required.ts", root)));
      },
      TIMEOUT,
    );
  });

  describe("stdout and stderr", () => {
    const duplicateOperationIds = [
      "openapi: 3.1.0",
      'info: { title: t, version: "1" }',
      "paths:",
      '  /a: { get: { operationId: same, responses: { "204": { description: none } } } }',
      '  /b: { get: { operationId: same, responses: { "204": { description: none } } } }',
    ].join("\n");

    test("types on stdout keep their warnings, on stderr (#42)", async () => {
      const { stdout, stderr } = await execa(cmd, [], { cwd, input: duplicateOperationIds });

      expect(stripAnsi(stderr)).toContain("(LINT_PROBLEM)");
      expect(stdout).not.toContain("LINT_PROBLEM");
      expect(stdout).toContain("export interface paths");
    });

    test("debug lines go to stderr, not into the types on stdout", async () => {
      const env = { DEBUG: "openapi-ts:*" };
      const { stdout, stderr } = await execa(cmd, [], { cwd, env, input: duplicateOperationIds });

      expect(stripAnsi(stderr)).toContain("openapi-ts:lint");
      expect(stdout).not.toContain("openapi-ts:");
    });
  });

  describe("Redocly config", () => {
    test.skipIf(os.platform() === "win32")("automatic config", async () => {
      const cwd = new URL("./fixtures/redocly/", import.meta.url);

      await execa("../../../bin/cli.js", {
        cwd: fileURLToPath(cwd),
      });
      for (const schema of ["a", "b", "c"]) {
        await expect(fs.readFileSync(new URL(`./output/${schema}.ts`, cwd), "utf8")).toMatchFileSnapshot(
          fileURLToPath(new URL("../../../examples/simple-example.ts", cwd)),
        );
      }
    });

    test("--redocly config", async () => {
      await execa(cmd, ["--redocly", "test/fixtures/redocly-flag/redocly.yaml"], {
        cwd,
      });
      for (const schema of ["a", "b", "c"]) {
        await expect(
          fs.readFileSync(new URL(`./test/fixtures/redocly-flag/output/${schema}.ts`, root), "utf8"),
        ).toMatchFileSnapshot(fileURLToPath(new URL("./examples/simple-example.ts", root)));
      }
    });

    test("--redocly explicit config path", async () => {
      const altOutput = new URL("./test/fixtures/redocly-flag/output-alt/", root);
      fs.rmSync(altOutput, { recursive: true, force: true });

      await execa(cmd, ["--redocly", "test/fixtures/redocly-flag/redocly.alt.yaml"], {
        cwd,
      });

      for (const schema of ["a", "b", "c"]) {
        await expect(
          fs.readFileSync(new URL(`./test/fixtures/redocly-flag/output-alt/${schema}.ts`, root), "utf8"),
        ).toMatchFileSnapshot(fileURLToPath(new URL("./examples/simple-example.ts", root)));
      }
    });

    test.skipIf(os.platform() === "win32")("lint error", async () => {
      const cwd = new URL("./fixtures/redocly-lint-error", import.meta.url);

      try {
        await execa("../../../bin/cli.js", {
          cwd: fileURLToPath(cwd),
        });
        throw new Error("Linting should have thrown an error");
      } catch (err) {
        expect(stripAnsi(String(err))).toMatch(/✘ {2}Servers must be present/);
      }
    });
  });
});
