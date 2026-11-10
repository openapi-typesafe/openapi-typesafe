import { describe, expect, it } from "vitest";
import { refForbiddenError } from "../../src/adapters/redocly-loader/schema-load-errors.js";
import type { RedoclyConfig } from "../../src/application/ports/redocly-config-source.js";
import { cliError } from "../../src/cli/cli-errors.js";
import { HELP_TEXT } from "../../src/cli/help-text.js";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig, fakeUrl } from "../fakes/cli-dependencies.js";

const CONFIG_PATH = fakePath("/work/api/redocly.yaml");

/** A CLI whose `redocly.yaml` at CONFIG_PATH defines `apis`, found without `--redocly`. */
function cliWithApis(apis: Record<string, Record<string, unknown>>, options = {}) {
  const cli = createFakeCli(options);
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

  it("runCli with an unknown flag prints a notice and still runs", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "--alphabetise"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.console.noticeLines).toEqual(["Unknown flag --alphabetise is ignored (see --help)"]);
  });

  it("runCli with a glob input exits with 2", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["schemas/*.yaml"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("(CLI_GLOB_UNSUPPORTED)");
  });

  it("runCli with a * in a URL generates it, since a URL is no glob pattern", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["https://api.test/openapi?fields=*"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual(["https://api.test/openapi?fields=*"]);
  });

  it("runCli with a * in the name of an existing file generates that file", async () => {
    const cli = createFakeCli();
    cli.files.files.set(fakePath("/work/api*.yaml"), "openapi: 3.1.0");

    const exitCode = await runCli(["api*.yaml"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual([fakeUrl("/work/api*.yaml")]);
  });

  it("runCli with --redocly at a missing path exits with 2", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["--redocly", "missing.yaml"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual(["Redocly config not found at: missing.yaml (CLI_CONFIG_NOT_FOUND)"]);
  });

  it("runCli with an unexpected failure exits with 70 and prints the stack", async () => {
    const cli = createFakeCli();
    cli.generator.failures.set(fakeUrl("/work/a.yaml"), new Error("boom"));

    const exitCode = await runCli(["a.yaml"], cli.deps);

    expect(exitCode).toBe(70);
    expect(cli.logger.messages("error")[0]).toMatch(/^Unexpected error: Error: boom/);
  });
});

describe("runCli: one schema", () => {
  it("runCli without --output writes the types to stdout and keeps the warnings (#42)", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "--immutable"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.stdout).toEqual([`types of ${fakeUrl("/work/a.yaml")}`]);
    expect(cli.console.infoLines).toEqual([]);
    const options = cli.generator.calls[0]?.options;
    expect(options).toMatchObject({ immutable: true });
    expect(options).not.toHaveProperty("silent");
    expect(options?.redocly).toBe(cli.redoclyConfigs.defaultConfig);
  });

  it("runCli from stdin with --output writes the file and prints where it went", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["-o", "out/types.ts"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.generator.calls[0]?.source).toBe(cli.stdin);
    expect(cli.generator.calls[0]?.options).not.toHaveProperty("silent");
    expect(cli.files.files.get(fakePath("/work/out/types.ts"))).toBe("types of stdin");
    expect(cli.console.infoLines).toEqual(["✨ *openapi-typesafe 1.2.3*", "🚀 stdin → *out/types.ts* [5ms]"]);
  });

  it("runCli prints the line for a written file with the query of a source URL hidden", async () => {
    const cli = createFakeCli();

    await runCli(["https://example.com/a.yaml?token=SECRET", "-o", "a.ts"], cli.deps);

    expect(cli.console.infoLines.at(-1)).toBe("🚀 https://example.com/a.yaml?*** → *a.ts* [5ms]");
  });

  it("runCli prints the names of the line for a written file as one plain line", async () => {
    const cli = createFakeCli();

    await runCli(["a\u001b[2K.yaml", "-o", "a\n::error::x.ts"], cli.deps);

    expect(cli.console.infoLines.at(-1)).toBe("🚀 a\\u001b[2K.yaml → *a\\n::error::x.ts* [5ms]");
  });

  it("runCli without a schema and with stdin a terminal fails instead of waiting (upstream #1905)", async () => {
    const cli = createFakeCli({ isStdinTerminal: true });

    const exitCode = await runCli(["-o", "out/types.ts"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.generator.calls).toEqual([]);
    expect(cli.logger.messages("error")).toEqual([
      expect.stringMatching(/^No schema given: .* \(CLI_INPUT_MISSING\)$/),
    ]);
  });

  it("runCli with stdin a terminal still generates the APIs of the Redocly config", async () => {
    const cli = cliWithApis({ a: { root: "./a.yaml", "x-openapi-ts": { output: "a.ts" } } }, { isStdinTerminal: true });

    expect(await runCli([], cli.deps)).toBe(0);
    expect(cli.generator.calls).toHaveLength(1);
  });

  it("runCli with an absolute --output writes to that path", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "--output", "/elsewhere/types.ts"], cli.deps);

    expect(cli.files.files.get(fakePath("/elsewhere/types.ts"))).toBe(`types of ${fakeUrl("/work/a.yaml")}`);
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
    cli.files.files.set(fakePath("/work/types.ts"), `types of ${fakeUrl("/work/a.yaml")}`);

    const exitCode = await runCli(["a.yaml", "-o", "types.ts", "--check"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.console.infoLines).toEqual(["✨ *openapi-typesafe 1.2.3*"]);
  });

  it("runCli --check with a stale file exits with 1 and keeps the file", async () => {
    const cli = createFakeCli();
    cli.files.files.set(fakePath("/work/types.ts"), "old");

    const exitCode = await runCli(["a.yaml", "-o", "types.ts", "--check"], cli.deps);

    expect(exitCode).toBe(1);
    expect(cli.files.files.get(fakePath("/work/types.ts"))).toBe("old");
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
    expect(cli.files.files.get(fakePath("/work/api/first.ts"))).toBe(`types of ${fakeUrl("/work/api/first.yaml")}`);
    expect(cli.files.files.get(fakePath("/work/api/out/2.ts"))).toBe("types of https://example.com/second.yaml");
  });

  it("runCli generates the APIs one after another, in the order of the config", async () => {
    const cli = cliWithApis({
      first: { root: "first.yaml", "x-openapi-ts": { output: "first.ts" } },
      second: { root: "second.yaml", "x-openapi-ts": { output: "second.ts" } },
      third: { root: "third.yaml", "x-openapi-ts": { output: "third.ts" } },
    });
    cli.generator.failures.set(fakeUrl("/work/api/first.yaml"), new Error("unreadable"));

    await runCli([], cli.deps);

    expect(cli.generator.mostAtOnce).toBe(1);
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual(
      ["first", "second", "third"].map((name) => fakeUrl(`/work/api/${name}.yaml`)),
    );
  });

  it("runCli takes an API's boolean flags in camelCase or kebab-case over the CLI flags", async () => {
    const cli = cliWithApis({
      api: {
        root: "api.yaml",
        "x-openapi-ts": { output: "api.ts", immutable: false, "export-type": true },
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

  it("runCli takes an API's camelCase flag over its kebab-case spelling", async () => {
    const cli = cliWithApis({
      api: { root: "api.yaml", "x-openapi-ts": { output: "api.ts", exportType: false, "export-type": true } },
    });

    await runCli(["--export-type"], cli.deps);

    expect(cli.generator.calls[0]?.options.exportType).toBe(false);
  });

  it("runCli with an API flag that is no boolean fails that API, naming key and API (G13)", async () => {
    const cli = cliWithApis({
      typo: { root: "typo.yaml", "x-openapi-ts": { output: "typo.ts", "root-types": "true" } },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts", immutable: true } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "API typo: `root-types` in x-openapi-ts must be true or false (CLI_CONFIG_INVALID)",
    ]);
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual([fakeUrl("/work/api/good.yaml")]);
  });

  it("runCli with an API output that is no text fails that API", async () => {
    const cli = cliWithApis({ api: { root: "api.yaml", "x-openapi-ts": { output: 5 } } });

    expect(await runCli([], cli.deps)).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "API api: `output` in x-openapi-ts must be a file path (CLI_CONFIG_INVALID)",
    ]);
  });

  it("runCli with x-openapi-ts that is no map fails that API", async () => {
    const cli = cliWithApis({ api: { root: "api.yaml", "x-openapi-ts": "api.ts" } });

    expect(await runCli([], cli.deps)).toBe(2);
    expect(cli.logger.messages("error")).toEqual(["API api: `x-openapi-ts` must be a map (CLI_CONFIG_INVALID)"]);
  });

  it("runCli with an API without a root fails that API and generates the others (G5)", async () => {
    const cli = cliWithApis({
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
      broken: { "x-openapi-ts": { output: "broken.ts" } },
      numbered: { root: 7, "x-openapi-ts": { output: "numbered.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "API broken: `root` in redocly.yaml must be the path or URL of its schema (CLI_CONFIG_INVALID)",
      "API numbered: `root` in redocly.yaml must be the path or URL of its schema (CLI_CONFIG_INVALID)",
    ]);
    expect([...cli.files.files.keys()]).toEqual([fakePath("/work/api/good.ts")]);
  });

  it("runCli with a Redocly config without `apis` generates the input", async () => {
    const cli = createFakeCli();
    cli.redoclyConfigs.configs.set(CONFIG_PATH, { configFile: CONFIG_PATH } as unknown as RedoclyConfig);
    cli.redoclyConfigs.found = CONFIG_PATH;

    expect(await runCli(["a.yaml"], cli.deps)).toBe(0);
    expect(cli.stdout).toEqual([`types of ${fakeUrl("/work/a.yaml")}`]);
  });

  it("runCli warns when an input is given as well, and uses the config", async () => {
    const cli = cliWithApis({ api: { root: "api.yaml", "x-openapi-ts": { output: "api.ts" } } });

    await runCli(["ignored.yaml"], cli.deps);

    expect(cli.logger.messages("warn")).toEqual([
      "APIs are specified both in Redocly Config and CLI argument. Only using Redocly config. (CLI_INPUT_IGNORED)",
    ]);
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual([fakeUrl("/work/api/api.yaml")]);
  });

  it("runCli warns when an output is given as well, and writes each API to its own output", async () => {
    const cli = cliWithApis({ api: { root: "api.yaml", "x-openapi-ts": { output: "api.ts" } } });

    expect(await runCli(["-o", "ignored.ts"], cli.deps)).toBe(0);

    expect(cli.logger.messages("warn")).toEqual([
      "APIs are specified in Redocly Config, so --output ignored.ts is ignored: each API is written to its x-openapi-ts.output. (CLI_OUTPUT_IGNORED)",
    ]);
    expect([...cli.files.files.keys()]).toEqual([fakePath("/work/api/api.ts")]);
  });

  it("runCli resolves the APIs from the working directory when the config has no file", async () => {
    const cli = createFakeCli();
    cli.redoclyConfigs.configs.set(
      CONFIG_PATH,
      fakeRedoclyConfig({ api: { root: "api.yaml", "x-openapi-ts": { output: "api.ts" } } }),
    );
    cli.redoclyConfigs.found = CONFIG_PATH;

    await runCli([], cli.deps);

    expect(cli.files.files.get(fakePath("/work/api.ts"))).toBe(`types of ${fakeUrl("/work/api.yaml")}`);
  });

  it("runCli with an API without an output exits with 2 and still writes the others", async () => {
    const cli = cliWithApis({
      broken: { root: "broken.yaml" },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("API broken is missing an `x-openapi-ts.output` key");
    expect(cli.files.files.has(fakePath("/work/api/good.ts"))).toBe(true);
  });

  it("runCli --check checks every API and fails when any output is stale", async () => {
    const cli = cliWithApis({
      fresh: { root: "fresh.yaml", "x-openapi-ts": { output: "fresh.ts" } },
      stale: { root: "stale.yaml", "x-openapi-ts": { output: "stale.ts" } },
    });
    cli.files.files.set(fakePath("/work/api/fresh.ts"), `types of ${fakeUrl("/work/api/fresh.yaml")}`);
    cli.files.files.set(fakePath("/work/api/stale.ts"), "old");

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
    cli.generator.failures.set(fakeUrl("/work/api/a.yaml"), cliError("CLI_FLAG_REMOVED", "first"));
    cli.generator.failures.set(fakeUrl("/work/api/b.yaml"), new Error("second"));

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    const errors = cli.logger.messages("error");
    expect(errors[0]).toBe("API a: first (CLI_FLAG_REMOVED)");
    expect(errors[1]).toMatch(/^API b: Unexpected error: Error: second/);
  });

  it("runCli names the API of a load error and keeps its exit code", async () => {
    const cli = cliWithApis({ a: { root: "a.yaml", "x-openapi-ts": { output: "a.ts" } } });
    cli.generator.failures.set(
      fakeUrl("/work/api/a.yaml"),
      refForbiddenError("/etc/passwd", { reason: "outside-local-root", localRoot: "/work" }),
    );

    expect(await runCli([], cli.deps)).toBe(3);

    expect(cli.logger.messages("error")[0]).toMatch(/^API a: .* \(SCHEMA_REF_FORBIDDEN\)$/);
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
      localRefRoot: new URL(fakeUrl("/work/schemas")),
      remoteRefHosts: ["api.example.com"],
    });
  });

  it("runCli with --local-ref-root as a URL of another protocol exits with 2 before generating", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(
      ["a.yaml", "--local-ref-root", "https://user:secret@example.com/specs/?key=k"],
      cli.deps,
    );

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "--local-ref-root https://***@example.com/specs/?***: a directory path or a file: URL. (CLI_FLAG_INVALID)",
    ]);
    expect(cli.generator.calls).toEqual([]);
  });

  it("runCli passes a file: URL --local-ref-root as it is", async () => {
    const cli = createFakeCli();
    const root = fakeUrl("/specs/");

    expect(await runCli(["a.yaml", "--local-ref-root", root], cli.deps)).toBe(0);

    expect(cli.generator.calls[0]?.options).toMatchObject({ localRefRoot: new URL(root) });
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
      fakeUrl("/work/a.yaml"),
      refForbiddenError("/etc/passwd", { reason: "outside-local-root", localRoot: "/work" }),
    );

    const exitCode = await runCli(["a.yaml", "--local-ref-root", "."], cli.deps);

    expect(exitCode).toBe(3);
  });
});
