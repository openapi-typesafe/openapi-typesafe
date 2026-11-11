import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig, fakeUrl } from "../fakes/cli-dependencies.js";

const CONFIG_PATH = fakePath("/work/api/redocly.yaml");

function cliWithApi(settings: Record<string, unknown>) {
  const cli = createFakeCli();
  const apis = { api: { root: "api.yaml", "x-openapi-ts": { output: "api.ts", ...settings } } };
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

describe("x-openapi-ts settings", () => {
  it("runCli with an unknown setting warns with CONFIG_SETTING_UNKNOWN and generates", async () => {
    const cli = cliWithApi({ alphabetise: true, "export-type": true });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.logger.messages("warn")).toEqual([
      "API api: the setting `alphabetise` is not an openapi-typesafe option and is ignored " +
        "(CONFIG_SETTING_UNKNOWN)",
    ]);
    expect(cli.generator.calls[0]?.options).toMatchObject({ exportType: true });
  });

  it("runCli with only known settings in either spelling prints no warning", async () => {
    const cli = cliWithApi({
      alphabetize: true,
      "root-types": true,
      fix: ["all"],
      "content-never": true,
      "local-ref-root": ".",
      remoteRefHosts: [],
    });

    await runCli([], cli.deps);

    expect(cli.logger.messages("warn")).toEqual([]);
  });

  it("runCli resolves an API's local-ref-root against the config file", async () => {
    const cli = cliWithApi({ "local-ref-root": "schemas" });

    await runCli(["--local-ref-root", "elsewhere"], cli.deps);

    expect(cli.generator.calls[0]?.options).toMatchObject({
      localRefRoot: new URL(fakeUrl("/work/api/schemas")),
    });
  });

  it("runCli with an empty local-ref-root limits refs to the config file's directory", async () => {
    const cli = cliWithApi({ localRefRoot: null });

    await runCli([], cli.deps);

    expect(cli.generator.calls[0]?.options).toMatchObject({
      localRefRoot: new URL(fakeUrl("/work/api")),
    });
  });

  it("runCli takes an API's remote-ref-hosts list or comma string over the flag", async () => {
    const listed = cliWithApi({ "remote-ref-hosts": ["a.example", "b.example:8443"] });
    const comma = cliWithApi({ remoteRefHosts: "a.example, b.example" });

    await runCli(["--remote-ref-hosts", "c.example"], listed.deps);
    await runCli([], comma.deps);

    expect(listed.generator.calls[0]?.options).toMatchObject({
      remoteRefHosts: ["a.example", "b.example:8443"],
    });
    expect(comma.generator.calls[0]?.options).toMatchObject({
      remoteRefHosts: ["a.example", "b.example"],
    });
  });

  it("runCli with an empty remote-ref-hosts setting allows no host", async () => {
    const cli = cliWithApi({ "remote-ref-hosts": [] });

    await runCli(["--remote-ref-hosts", "c.example"], cli.deps);

    expect(cli.generator.calls[0]?.options).toMatchObject({ remoteRefHosts: [] });
  });

  it("runCli keeps the CLI's $ref limits for an API that sets none", async () => {
    const cli = cliWithApi({});

    await runCli(["--remote-ref-hosts", "c.example"], cli.deps);

    expect(cli.generator.calls[0]?.options).toMatchObject({ remoteRefHosts: ["c.example"] });
    expect(cli.generator.calls[0]?.options).not.toHaveProperty("localRefRoot");
  });

  it("runCli with a local-ref-root URL of another protocol exits with 2 before generating", async () => {
    const cli = cliWithApi({ "local-ref-root": "https://example.com/specs/" });

    expect(await runCli([], cli.deps)).toBe(2);

    expect(cli.logger.messages("error")).toEqual([
      "API api: `local-ref-root` in x-openapi-ts must be a directory path or a file: URL of a local directory (CLI_CONFIG_INVALID)",
    ]);
    expect(cli.generator.calls).toEqual([]);
  });

  it("runCli with a local-ref-root file: URL that names no local path exits with 2 before generating", async () => {
    const cli = cliWithApi({ "local-ref-root": "file:///a%2Fb/" });

    expect(await runCli([], cli.deps)).toBe(2);

    expect(cli.logger.messages("error")).toEqual([
      "API api: `local-ref-root` in x-openapi-ts must be a directory path or a file: URL of a local directory (CLI_CONFIG_INVALID)",
    ]);
    expect(cli.generator.calls).toEqual([]);
  });

  it("runCli with a $ref limit of the wrong type exits with 2 before generating", async () => {
    const root = cliWithApi({ "local-ref-root": true });
    const hosts = cliWithApi({ "remote-ref-hosts": [1] });

    expect(await runCli([], root.deps)).toBe(2);
    expect(await runCli([], hosts.deps)).toBe(2);

    expect(root.logger.messages("error")).toEqual([
      "API api: `local-ref-root` in x-openapi-ts must be a directory path or a file: URL of a local directory (CLI_CONFIG_INVALID)",
    ]);
    expect(hosts.logger.messages("error")).toEqual([
      "API api: `remote-ref-hosts` in x-openapi-ts must be a host list (CLI_CONFIG_INVALID)",
    ]);
    expect([...root.generator.calls, ...hosts.generator.calls]).toEqual([]);
  });
});
