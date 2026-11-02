import { describe, expect, it } from "vitest";
import { refForbiddenError } from "../../src/adapters/redocly-loader/schema-load-errors.js";
import { cliError } from "../../src/cli/cli-errors.js";
import { HELP_TEXT } from "../../src/cli/help-text.js";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakeRedoclyConfig } from "../fakes/cli-dependencies.js";

const CONFIG_PATH = "/work/api/redocly.yaml";

/** A CLI whose `redocly.yaml` at CONFIG_PATH defines `apis`, found without `--redocly`. */
function cliWithApis(apis: Record<string, Record<string, unknown>>) {
  const cli = createFakeCli();
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

describe("runCli: help, version and flags", () => {
  it("runCli with --help prints the help and exits with 0", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["--help"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.console.infoLines).toEqual([HELP_TEXT]);
    expect(cli.generator.calls).toEqual([]);
  });

  it("runCli with --version prints the version", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["--version"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.console.infoLines).toEqual(["v1.2.3"]);
  });

  it("runCli with a removed flag exits with 2 and prints the error code", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["--immutable-types", "a.yaml"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      'The --immutable-types flag has been renamed to "--immutable". (CLI_FLAG_REMOVED)',
    ]);
  });

  it("runCli with a root-types flag but no --root-types prints a notice and still runs", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "--root-types-keep-casing"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.console.noticeLines).toEqual(["--root-types-keep-casing has no effect without --root-types flag"]);
  });

  it("runCli with a glob input exits with 2", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["schemas/*.yaml"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("(CLI_GLOB_UNSUPPORTED)");
  });

  it("runCli with --redocly at a missing path exits with 2", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["--redocly", "missing.yaml"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual(["Redocly config not found at: missing.yaml (CLI_CONFIG_NOT_FOUND)"]);
  });

  it("runCli with an unexpected failure exits with 70 and prints the stack", async () => {
    const cli = createFakeCli();
    cli.generator.failures.set("file:///work/a.yaml", new Error("boom"));

    const exitCode = await runCli(["a.yaml"], cli.deps);

    expect(exitCode).toBe(70);
    expect(cli.logger.messages("error")[0]).toMatch(/^Unexpected error: Error: boom/);
  });
});

describe("runCli: one schema", () => {
  it("runCli without --output writes the types to stdout, silently", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "--immutable"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.stdout).toEqual(["types of file:///work/a.yaml"]);
    expect(cli.console.infoLines).toEqual([]);
    const options = cli.generator.calls[0]?.options;
    expect(options).toMatchObject({ immutable: true, silent: true });
    expect(options?.redocly).toBe(cli.redoclyConfigs.defaultConfig);
  });

  it("runCli from stdin with --output writes the file and prints where it went", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["-o", "out/types.ts"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.generator.calls[0]?.source).toBe(cli.stdin);
    expect(cli.generator.calls[0]?.options.silent).toBe(false);
    expect(cli.files.files.get("/work/out/types.ts")).toBe("types of stdin");
    expect(cli.console.infoLines).toEqual(["✨ *openapi-typesafe 1.2.3*", "🚀 stdin → *out/types.ts* [5ms]"]);
  });

  it("runCli with an absolute --output writes to that path", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "--output", "/elsewhere/types.ts"], cli.deps);

    expect(cli.files.files.get("/elsewhere/types.ts")).toBe("types of file:///work/a.yaml");
  });

  it("runCli with a URL input passes the URL", async () => {
    const cli = createFakeCli();

    await runCli(["https://example.com/openapi.yaml"], cli.deps);

    expect(cli.generator.calls[0]?.source).toEqual(new URL("https://example.com/openapi.yaml"));
  });

  it("runCli with an explicit --redocly config without APIs uses it for the schema", async () => {
    const cli = createFakeCli();
    const config = fakeRedoclyConfig({});
    cli.redoclyConfigs.configs.set("redocly.yaml", config);

    await runCli(["a.yaml", "-c", "redocly.yaml"], cli.deps);

    expect(cli.generator.calls[0]?.options.redocly).toBe(config);
  });
});

describe("runCli --check", () => {
  it("runCli --check with an up-to-date file exits with 0 and writes nothing", async () => {
    const cli = createFakeCli();
    cli.files.files.set("/work/types.ts", "types of file:///work/a.yaml");

    const exitCode = await runCli(["a.yaml", "-o", "types.ts", "--check"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.console.infoLines).toEqual(["✨ *openapi-typesafe 1.2.3*"]);
  });

  it("runCli --check with a stale file exits with 1 and keeps the file", async () => {
    const cli = createFakeCli();
    cli.files.files.set("/work/types.ts", "old");

    const exitCode = await runCli(["a.yaml", "-o", "types.ts", "--check"], cli.deps);

    expect(exitCode).toBe(1);
    expect(cli.files.files.get("/work/types.ts")).toBe("old");
    expect(cli.logger.messages("error")).toEqual([
      "Generated types are not up-to-date! types.ts differs from its schema. (OUTPUT_STALE)",
    ]);
  });

  it("runCli --check without --output exits with 2 and generates nothing", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "--check"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("(CLI_CHECK_OUTPUT_MISSING)");
    expect(cli.stdout).toEqual([]);
  });

  it("runCli --check with a missing file exits with 4", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "-o", "types.ts", "--check"], cli.deps);

    expect(exitCode).toBe(4);
  });
});

describe("runCli with the APIs of a Redocly config", () => {
  it("runCli generates every API next to the config file", async () => {
    const cli = cliWithApis({
      first: { root: "first.yaml", "x-openapi-ts": { output: "first.ts" } },
      second: { root: "https://example.com/second.yaml", "x-openapi-ts": { output: "out/2.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.files.files.get("/work/api/first.ts")).toBe("types of file:///work/api/first.yaml");
    expect(cli.files.files.get("/work/api/out/2.ts")).toBe("types of https://example.com/second.yaml");
  });

  it("runCli takes an API's boolean flags in camelCase or kebab-case over the CLI flags", async () => {
    const cli = cliWithApis({
      api: {
        root: "api.yaml",
        "x-openapi-ts": { output: "api.ts", immutable: false, "export-type": true, enum: "no" },
      },
    });

    await runCli(["--immutable", "--enum"], cli.deps);

    expect(cli.generator.calls[0]?.options).toMatchObject({
      immutable: false,
      exportType: true,
      enum: true,
    });
    expect(cli.generator.calls[0]?.options.silent).toBeUndefined();
  });

  it("runCli warns when an input is given as well, and uses the config", async () => {
    const cli = cliWithApis({ api: { root: "api.yaml", "x-openapi-ts": { output: "api.ts" } } });

    await runCli(["ignored.yaml"], cli.deps);

    expect(cli.logger.messages("warn")).toEqual([
      "APIs are specified both in Redocly Config and CLI argument. Only using Redocly config.",
    ]);
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual(["file:///work/api/api.yaml"]);
  });

  it("runCli resolves the APIs from the working directory when the config has no file", async () => {
    const cli = createFakeCli();
    cli.redoclyConfigs.configs.set(
      CONFIG_PATH,
      fakeRedoclyConfig({ api: { root: "api.yaml", "x-openapi-ts": { output: "api.ts" } } }),
    );
    cli.redoclyConfigs.found = CONFIG_PATH;

    await runCli([], cli.deps);

    expect(cli.files.files.get("/work/api.ts")).toBe("types of file:///work/api.yaml");
  });

  it("runCli with an API without an output exits with 2 and still writes the others", async () => {
    const cli = cliWithApis({
      broken: { root: "broken.yaml" },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("API broken is missing an `x-openapi-ts.output` key");
    expect(cli.files.files.has("/work/api/good.ts")).toBe(true);
  });

  it("runCli --check checks every API and fails when any output is stale", async () => {
    const cli = cliWithApis({
      fresh: { root: "fresh.yaml", "x-openapi-ts": { output: "fresh.ts" } },
      stale: { root: "stale.yaml", "x-openapi-ts": { output: "stale.ts" } },
    });
    cli.files.files.set("/work/api/fresh.ts", "types of file:///work/api/fresh.yaml");
    cli.files.files.set("/work/api/stale.ts", "old");

    const exitCode = await runCli(["--check"], cli.deps);

    expect(exitCode).toBe(1);
    expect(cli.logger.messages("error")).toEqual([
      "Generated types are not up-to-date! stale.ts differs from its schema. (OUTPUT_STALE)",
    ]);
  });

  it("runCli prints every failed API and exits with the first one's code", async () => {
    const cli = cliWithApis({
      a: { root: "a.yaml", "x-openapi-ts": { output: "a.ts" } },
      b: { root: "b.yaml", "x-openapi-ts": { output: "b.ts" } },
    });
    cli.generator.failures.set("file:///work/api/a.yaml", cliError("CLI_FLAG_REMOVED", "first"));
    cli.generator.failures.set("file:///work/api/b.yaml", new Error("second"));

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    const errors = cli.logger.messages("error");
    expect(errors[0]).toBe("first (CLI_FLAG_REMOVED)");
    expect(errors[1]).toMatch(/^Unexpected error: Error: second/);
  });
});

describe("runCli: $ref limits", () => {
  it("runCli passes --local-ref-root, resolved against the cwd, and --remote-ref-hosts", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(
      ["a.yaml", "--local-ref-root", "schemas", "--remote-ref-hosts", "api.example.com"],
      cli.deps,
    );

    expect(exitCode).toBe(0);
    expect(cli.generator.calls[0]?.options).toMatchObject({
      localRefRoot: new URL("file:///work/schemas"),
      remoteRefHosts: ["api.example.com"],
    });
  });

  it("runCli passes the $ref limits to every API of the Redocly config", async () => {
    const cli = cliWithApis({ first: { root: "first.yaml", "x-openapi-ts": { output: "first.ts" } } });

    const exitCode = await runCli(["--remote-ref-hosts="], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.generator.calls[0]?.options).toMatchObject({ remoteRefHosts: [] });
  });

  it("runCli without the flags sets no $ref limits", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml"], cli.deps);

    expect(cli.generator.calls[0]?.options).not.toHaveProperty("localRefRoot");
    expect(cli.generator.calls[0]?.options).not.toHaveProperty("remoteRefHosts");
  });

  it("runCli exits with 3 when a $ref is refused", async () => {
    const cli = createFakeCli();
    cli.generator.failures.set(
      "file:///work/a.yaml",
      refForbiddenError("/etc/passwd", { reason: "outside-local-root", localRoot: "/work" }),
    );

    const exitCode = await runCli(["a.yaml", "--local-ref-root", "."], cli.deps);

    expect(exitCode).toBe(3);
  });
});
