import { describe, expect, it } from "vitest";
import { parseCliArguments } from "../../src/cli/cli-arguments.js";
import { fixNamesOf, fixOption } from "../../src/cli/fix-option.js";
import { HELP_TEXT } from "../../src/cli/help-text.js";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig } from "../fakes/cli-dependencies.js";

const CONFIG_PATH = "/work/api/redocly.yaml";

function cliWithApi(settings: Record<string, unknown>) {
  const cli = createFakeCli();
  const apis = { api: { root: "api.yaml", "x-openapi-ts": { output: "api.ts", ...settings } } };
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

describe("fixNamesOf", () => {
  it("fixNamesOf without a value returns undefined", () => {
    expect(fixNamesOf(undefined)).toBeUndefined();
  });

  it("fixNamesOf splits comma-separated and repeated values and trims them", () => {
    expect(fixNamesOf(["allof-required, all", "allof-required"])).toEqual(["allof-required", "all", "allof-required"]);
  });

  it("fixNamesOf with an empty value returns no names", () => {
    expect(fixNamesOf("")).toEqual([]);
  });

  it("fixNamesOf with an unknown name fails with OPTION_FIX_UNKNOWN", () => {
    expect(() => fixNamesOf("allof-required,allOf-required")).toThrow(
      expect.objectContaining({
        code: "OPTION_FIX_UNKNOWN",
        details: expect.objectContaining({ unknown: ["allOf-required"] }),
      }),
    );
  });

  it("fixOption without names sets no option", () => {
    expect(fixOption(undefined)).toEqual({});
    expect(fixOption(["all"])).toEqual({ fix: ["all"] });
  });
});

describe("--fix", () => {
  it("parseCliArguments reads --fix; a following input stays the input", () => {
    const args = parseCliArguments(["--fix", "allof-required", "a.yaml", "--fix=all"]);

    expect(args.fix).toEqual(["allof-required", "all"]);
    expect(args.input).toBe("a.yaml");
  });

  it("parseCliArguments without --fix leaves it unset", () => {
    expect(parseCliArguments(["a.yaml"]).fix).toBeUndefined();
  });

  it("runCli passes --fix to the generator", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "--fix", "allof-required"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.generator.calls[0]?.options).toMatchObject({ fix: ["allof-required"] });
  });

  it("runCli without --fix passes no fix option", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml"], cli.deps);

    expect(cli.generator.calls[0]?.options).not.toHaveProperty("fix");
  });

  it("runCli with an unknown fix exits with 2 before generating", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "--fix", "bogus"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      'Unknown fix "bogus". Known fixes: allof-discriminated-union, allof-required, anyof-oneof-descriptions, anyof-oneof-required, anyof-properties, array-length-tuples, dedupe-enum-names, discriminator-member-required, discriminator-values, exploded-query-objects, nullable-enums, parameter-content, path-param-type-names, prefix-items, read-write-refs, ref-pointers, ref-siblings, root-type-numbering, unevaluated-properties, all. (OPTION_FIX_UNKNOWN)',
    ]);
    expect(cli.generator.calls).toEqual([]);
  });

  it("runCli takes an API's fix list instead of --fix", async () => {
    const cli = cliWithApi({ fix: ["all"] });

    await runCli(["--fix", "allof-required"], cli.deps);

    expect(cli.generator.calls[0]?.options).toMatchObject({ fix: ["all"] });
  });

  it("runCli reads a comma-separated fix setting of an API", async () => {
    const cli = cliWithApi({ fix: "allof-required, all" });

    await runCli([], cli.deps);

    expect(cli.generator.calls[0]?.options).toMatchObject({ fix: ["allof-required", "all"] });
  });

  it("runCli with an unknown fix in an API names the API and generates the others (G13)", async () => {
    const cli = createFakeCli();
    const configPath = fakePath("/work/redocly.yaml");
    const apis = {
      a: { root: "a.yaml", "x-openapi-ts": { output: "a.ts", fix: ["nope"] } },
      b: { root: "b.yaml", "x-openapi-ts": { output: "b.ts" } },
    };
    cli.redoclyConfigs.configs.set(configPath, fakeRedoclyConfig(apis, configPath));
    cli.redoclyConfigs.found = configPath;

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toMatch(/^API a: Unknown fix "nope"\. .* \(OPTION_FIX_UNKNOWN\)$/);
    expect([...cli.files.files.keys()]).toEqual([fakePath("/work/b.ts")]);
  });

  it("runCli with a fix setting that is no text fails with CLI_CONFIG_INVALID", async () => {
    const cli = cliWithApi({ fix: [1] });

    expect(await runCli([], cli.deps)).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "API api: `fix` in x-openapi-ts must be a list of fix names or a comma list (CLI_CONFIG_INVALID)",
    ]);
  });

  it("runCli uses --fix for an API without a fix setting", async () => {
    const cli = cliWithApi({});

    await runCli(["--fix", "all"], cli.deps);

    expect(cli.generator.calls[0]?.options).toMatchObject({ fix: ["all"] });
  });

  it("the help text lists --fix", () => {
    expect(HELP_TEXT).toContain("  --fix [names]              Turn on output fixes");
  });
});
