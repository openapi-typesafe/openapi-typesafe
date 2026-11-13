import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig } from "../fakes/cli-dependencies.js";

const CONFIG_PATH = fakePath("/work/api/redocly.yaml");

/** A CLI whose `redocly.yaml` at CONFIG_PATH defines `apis`, found without `--redocly`. */
function cliWithApis(apis: Record<string, Record<string, unknown>>) {
  const cli = createFakeCli();
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

describe("runCli with the APIs of a Redocly config", () => {
  it("runCli passes each API's name to the generation, so its log lines name it", async () => {
    const cli = cliWithApis({
      a: { root: "a.yaml", "x-openapi-ts": { output: "a.ts" } },
      b: { root: "b.yaml", "x-openapi-ts": { output: "b.ts" } },
    });

    expect(await runCli([], cli.deps)).toBe(0);

    expect(cli.generator.calls.map((call) => call.apiName)).toEqual(["a", "b"]);
  });

  it("runCli generates each API with the Redocly config of that API", async () => {
    const cli = cliWithApis({
      strict: { root: "a.yaml", "x-openapi-ts": { output: "a.ts" } },
      plain: { root: "b.yaml", "x-openapi-ts": { output: "b.ts" } },
    });
    const strictConfig = fakeRedoclyConfig({}, CONFIG_PATH);
    cli.redoclyConfigs.apiConfigs.set("strict", strictConfig);

    expect(await runCli([], cli.deps)).toBe(0);

    const configs = cli.generator.calls.map((call) => call.options.redocly);
    expect(configs[0]).toBe(strictConfig);
    expect(configs[1]).toBe(cli.redoclyConfigs.configs.get(CONFIG_PATH));
  });

  it("runCli passes the reference limits of the command line to every API", async () => {
    const cli = cliWithApis({
      a: { root: "a.yaml", "x-openapi-ts": { output: "a.ts" } },
      b: { root: "b.yaml", "x-openapi-ts": { output: "b.ts" } },
    });

    expect(await runCli(["--remote-ref-hosts", "api.example.com"], cli.deps)).toBe(0);

    const hosts = cli.generator.calls.map((call) => call.options.remoteRefHosts);
    expect(hosts).toEqual([["api.example.com"], ["api.example.com"]]);
  });

  it("runCli with an invalid --local-ref-root fails once and generates no API", async () => {
    const cli = cliWithApis({
      a: { root: "a.yaml", "x-openapi-ts": { output: "a.ts" } },
      b: { root: "b.yaml", "x-openapi-ts": { output: "b.ts" } },
    });

    const exitCode = await runCli(["--local-ref-root", "https://example.com/specs/"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "--local-ref-root https://example.com/specs/: a directory path or a file: URL of a local directory. (CLI_FLAG_INVALID)",
    ]);
    expect(cli.generator.calls).toEqual([]);
  });

  it("runCli with a --local-ref-root that is not a valid URL fails with CLI_FLAG_INVALID", async () => {
    const cli = cliWithApis({ a: { root: "a.yaml", "x-openapi-ts": { output: "a.ts" } } });

    const exitCode = await runCli(["--local-ref-root", "http://[::1/x"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "--local-ref-root http://[::1/x: a directory path or a file: URL of a local directory. (CLI_FLAG_INVALID)",
    ]);
    expect(cli.generator.calls).toEqual([]);
  });

  it("runCli names an ineffective flag for each API whose merged flags make it so", async () => {
    const cli = cliWithApis({
      typed: { root: "typed.yaml", "x-openapi-ts": { output: "typed.ts", "root-types": true } },
      plain: { root: "plain.yaml", "x-openapi-ts": { output: "plain.ts" } },
    });

    expect(await runCli(["--root-types-keep-casing"], cli.deps)).toBe(0);

    expect(cli.console.noticeLines).toEqual([
      "API plain: --root-types-keep-casing has no effect without --root-types flag",
    ]);
  });

  it("runCli names an ineffective flag that an API's own settings set", async () => {
    const settings = { output: "a.ts", "root-types-no-schema-prefix": true };
    const cli = cliWithApis({ a: { root: "a.yaml", "x-openapi-ts": settings } });

    expect(await runCli([], cli.deps)).toBe(0);

    expect(cli.console.noticeLines).toEqual([
      "API a: --root-types-no-schema-prefix has no effect without --root-types flag",
    ]);
  });

  it("runCli with an API that turns --root-types off names the flag for it", async () => {
    const settings = { output: "a.ts", "root-types": false };
    const cli = cliWithApis({ a: { root: "a.yaml", "x-openapi-ts": settings } });

    expect(await runCli(["--root-types", "--root-types-keep-casing"], cli.deps)).toBe(0);

    expect(cli.console.noticeLines).toEqual([
      "API a: --root-types-keep-casing has no effect without --root-types flag",
    ]);
  });
});
