import { describe, expect, it } from "vitest";
import { urlInvalidError } from "../../src/adapters/redocly-loader/schema-load-errors.js";
import { parseCliArguments } from "../../src/cli/cli-arguments.js";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig } from "../fakes/cli-dependencies.js";

/**
 * An empty schema argument or location flag (an unset shell variable, `--output=`, a trailing
 * `-o`) is a usage error: read as unset, it read stdin, wrote the types to stdout or looked for
 * another config, without a word.
 */

const EMPTY_INPUT =
  "The schema argument is empty: pass a schema path or URL, or leave the argument out to read " +
  "stdin. (CLI_LOCATION_INVALID)";
const EMPTY_OUTPUT =
  "--output is empty: give a file path or URL, or leave the flag out to write the types to " +
  "stdout. (CLI_FLAG_INVALID)";
const EMPTY_REDOCLY =
  "--redocly is empty: give the path of a redocly.yaml file, or leave the flag out to find one. " +
  "(CLI_FLAG_INVALID)";

describe("parseCliArguments with empty locations", () => {
  it("parseCliArguments with an empty schema argument fails with CLI_LOCATION_INVALID", () => {
    expect(() => parseCliArguments([""])).toThrow(expect.objectContaining({ code: "CLI_LOCATION_INVALID" }));
  });

  it.each([
    [["a.yaml", "-o", ""]],
    [["a.yaml", "--output="]],
    [["a.yaml", "-o"]],
    [["a.yaml", "-o", "out.ts", "--output", ""]],
  ])("parseCliArguments with the empty output of %j fails with CLI_FLAG_INVALID", (argv) => {
    expect(() => parseCliArguments(argv)).toThrow(expect.objectContaining({ code: "CLI_FLAG_INVALID" }));
  });

  it.each([[["a.yaml", "-c", ""]], [["a.yaml", "--redocly="]], [["a.yaml", "--redocly"]]])(
    "parseCliArguments with the empty Redocly config of %j fails with CLI_FLAG_INVALID",
    (argv) => {
      expect(() => parseCliArguments(argv)).toThrow(expect.objectContaining({ code: "CLI_FLAG_INVALID" }));
    },
  );

  it("parseCliArguments with an empty value before the last one uses the last one", () => {
    expect(parseCliArguments(["a.yaml", "-o", "", "-o", "out.ts"]).output).toBe("out.ts");
  });
});

describe("runCli with empty locations", () => {
  it("runCli with an empty schema argument exits with 2 and reads no stdin", async () => {
    const cli = createFakeCli();
    cli.generator.failures.set("stdin", urlInvalidError("http://[::1/x", "stream"));

    const exitCode = await runCli(["", "-o", "out.ts"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([EMPTY_INPUT]);
    expect(cli.generator.calls).toEqual([]);
  });

  it("runCli with an empty schema argument and the APIs of a Redocly config exits with 2", async () => {
    const config = fakePath("/work/redocly.yaml");
    const cli = createFakeCli();
    const apis = { a: { root: "a.yaml", "x-openapi-ts": { output: "a.ts" } } };
    cli.redoclyConfigs.configs.set(config, fakeRedoclyConfig(apis, config));
    cli.redoclyConfigs.found = config;

    expect(await runCli([""], cli.deps)).toBe(2);

    expect(cli.logger.messages("error")).toEqual([EMPTY_INPUT]);
  });

  it("runCli with an empty --output exits with 2 and writes nothing to stdout", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "-o", ""], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([EMPTY_OUTPUT]);
    expect(cli.stdout).toEqual([]);
  });

  it("runCli with an empty --redocly exits with 2 and looks for no config", async () => {
    const cli = createFakeCli();
    cli.redoclyConfigs.found = fakePath("/work/redocly.yaml");

    const exitCode = await runCli(["a.yaml", "--redocly="], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([EMPTY_REDOCLY]);
    expect(cli.generator.calls).toEqual([]);
  });
});
