import { sep } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig, fakeUrl } from "../fakes/cli-dependencies.js";

/** An output path that names the schema file fails before anything is generated (F6). */

const SCHEMA_TEXT = "openapi: 3.1.0";
const CONFIG_PATH = fakePath("/work/api/redocly.yaml");

/** A CLI whose working directory holds `api.yaml`. */
function cliWithSchema() {
  const cli = createFakeCli();
  cli.files.files.set(fakePath("/work/api.yaml"), SCHEMA_TEXT);
  return cli;
}

function cliWithApis(apis: Record<string, Record<string, unknown>>) {
  const cli = createFakeCli();
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

describe("runCli: an output that is the input schema", () => {
  it("runCli with --output equal to the input exits with 2 and keeps the schema", async () => {
    const cli = cliWithSchema();

    const exitCode = await runCli(["api.yaml", "-o", "./specs/../api.yaml"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.generator.calls).toEqual([]);
    expect(cli.files.files.get(fakePath("/work/api.yaml"))).toBe(SCHEMA_TEXT);
    expect(cli.logger.messages("error")).toEqual([
      "The output ./specs/../api.yaml is the schema api.yaml: writing the types would overwrite it. " +
        "Choose another output file. (CLI_OUTPUT_IS_INPUT)",
    ]);
  });

  it("runCli with an output that links to the input exits with 2", async () => {
    const cli = cliWithSchema();
    cli.files.links.set(fakePath("/work/API.YAML"), fakePath("/work/api.yaml"));

    const exitCode = await runCli(["api.yaml", "-o", "API.YAML"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("(CLI_OUTPUT_IS_INPUT)");
  });

  it("runCli with a file: URL input and its path as --output exits with 2", async () => {
    const cli = cliWithSchema();

    const exitCode = await runCli([fakeUrl("/work/api.yaml"), "-o", "api.yaml"], cli.deps);

    expect(exitCode).toBe(2);
  });

  it("runCli --check with the input as --output exits with 2 instead of comparing", async () => {
    const cli = cliWithSchema();

    const exitCode = await runCli(["api.yaml", "-o", "api.yaml", "--check"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("(CLI_OUTPUT_IS_INPUT)");
  });

  it("runCli with a remote input writes an output of the same name", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["https://example.com/api.yaml", "-o", "api.yaml"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.files.files.get(fakePath("/work/api.yaml"))).toBe("types of https://example.com/api.yaml");
  });
});

describe("runCli: a Redocly API output that is a schema", () => {
  it("runCli with an API output equal to its root exits with 2 and writes the others", async () => {
    const cli = cliWithApis({
      same: { root: "same.yaml", "x-openapi-ts": { output: "same.yaml" } },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "API same: The output same.yaml is the schema same.yaml of API same: writing the types would overwrite " +
        "it. Choose another output file. (CLI_OUTPUT_IS_INPUT)",
    ]);
    expect(cli.files.files.has(fakePath("/work/api/same.yaml"))).toBe(false);
    expect(cli.files.files.get(fakePath("/work/api/good.ts"))).toBe(`types of ${fakeUrl("/work/api/good.yaml")}`);
  });

  it("runCli with an API output equal to another API's root exits with 2 and generates that API", async () => {
    const cli = cliWithApis({
      writer: { root: "writer.yaml", "x-openapi-ts": { output: "../api/reader.yaml" } },
      reader: { root: "reader.yaml", "x-openapi-ts": { output: "reader.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("is the schema reader.yaml of API reader");
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual([fakeUrl("/work/api/reader.yaml")]);
  });

  it("runCli with a remote API root writes an output of the same name", async () => {
    const cli = cliWithApis({
      remote: { root: "https://example.com/api.yaml", "x-openapi-ts": { output: "api.yaml" } },
    });

    expect(await runCli([], cli.deps)).toBe(0);
  });

  it("runCli with an API root that is no valid URL still generates the other APIs", async () => {
    const cli = cliWithApis({
      broken: { root: "https://", "x-openapi-ts": { output: "broken.ts" } },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
    });

    await runCli([], cli.deps);

    expect(cli.files.files.has(fakePath("/work/api/good.ts"))).toBe(true);
  });
});

describe("runCli: Redocly APIs with the same output", () => {
  it("runCli with two APIs writing one file fails both with exit code 2 and writes the others", async () => {
    const cli = cliWithApis({
      first: { root: "first.yaml", "x-openapi-ts": { output: "types.ts" } },
      second: { root: "second.yaml", "x-openapi-ts": { output: "./out/../types.ts" } },
      own: { root: "own.yaml", "x-openapi-ts": { output: "own.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "API first: The output types.ts is also the output of API second: they would overwrite " +
        "each other. Give each API its own output file. (CLI_OUTPUT_DUPLICATE)",
      "API second: The output ./out/../types.ts is also the output of API first: they would " +
        "overwrite each other. Give each API its own output file. (CLI_OUTPUT_DUPLICATE)",
    ]);
    expect(cli.files.files.has(fakePath("/work/api/types.ts"))).toBe(false);
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual([fakeUrl("/work/api/own.yaml")]);
  });

  it("runCli with outputs that link to one file names every other API", async () => {
    const cli = cliWithApis({
      a: { root: "a.yaml", "x-openapi-ts": { output: "types.ts" } },
      b: { root: "b.yaml", "x-openapi-ts": { output: "TYPES.ts" } },
      c: { root: "c.yaml", "x-openapi-ts": { output: "link.ts" } },
    });
    cli.files.links.set(fakePath("/work/api/TYPES.ts"), fakePath("/work/api/types.ts"));
    cli.files.links.set(fakePath("/work/api/link.ts"), fakePath("/work/api/types.ts"));

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("is also the output of API b, API c:");
    expect(cli.generator.calls).toEqual([]);
  });

  it("runCli with an API without an output or with a remote one compares the others only", async () => {
    const cli = cliWithApis({
      missing: { root: "missing.yaml" },
      remote: { root: "remote.yaml", "x-openapi-ts": { output: "https://" } },
      local: { root: "local.yaml", "x-openapi-ts": { output: "local.ts" } },
    });

    await runCli([], cli.deps);

    expect(cli.files.files.has(fakePath("/work/api/local.ts"))).toBe(true);
    expect(cli.logger.messages("error").join("\n")).not.toContain("CLI_OUTPUT_DUPLICATE");
  });
});

describe("runCli: an output that is a file the run reads besides the root (G11)", () => {
  it("runCli with --output equal to a $ref'd file exits with 2 and writes nothing", async () => {
    const cli = cliWithSchema();
    cli.files.files.set(fakePath("/work/models.yaml"), "M: { type: string }");
    cli.generator.readFiles.set(fakeUrl("/work/api.yaml"), [new URL(fakeUrl("/work/models.yaml"))]);

    const exitCode = await runCli(["api.yaml", "-o", "models.yaml"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.files.files.get(fakePath("/work/models.yaml"))).toBe("M: { type: string }");
    expect(cli.logger.messages("error")).toEqual([
      "The output models.yaml is the schema models.yaml that api.yaml reads: writing the types would " +
        "overwrite it. Choose another output file. (CLI_OUTPUT_IS_INPUT)",
    ]);
  });

  it("runCli from stdin with --output equal to a $ref'd file exits with 2", async () => {
    const cli = createFakeCli();
    cli.generator.readFiles.set("stdin", [new URL(fakeUrl("/work/models.yaml"))]);

    expect(await runCli(["-o", "models.yaml"], cli.deps)).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("is the schema models.yaml that stdin reads");
  });

  it("runCli with --output equal to the Redocly config exits with 2 before generating", async () => {
    const cli = cliWithSchema();
    const configPath = fakePath("/work/redocly.yaml");
    cli.redoclyConfigs.configs.set(configPath, fakeRedoclyConfig({}, configPath));
    cli.redoclyConfigs.found = configPath;

    const exitCode = await runCli(["api.yaml", "-o", "redocly.yaml"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.generator.calls).toEqual([]);
    expect(cli.logger.messages("error")[0]).toContain("is the Redocly config redocly.yaml:");
  });

  it("runCli with an API output equal to the Redocly config fails that API before generating it", async () => {
    const cli = cliWithApis({
      config: { root: "config.yaml", "x-openapi-ts": { output: "./redocly.yaml" } },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
    });

    expect(await runCli([], cli.deps)).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain(`is the Redocly config ${["api", "redocly.yaml"].join(sep)}:`);
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual([fakeUrl("/work/api/good.yaml")]);
  });

  it("runCli with an API output that another API $refs fails that API and writes the reader", async () => {
    const cli = cliWithApis({
      writer: { root: "writer.yaml", "x-openapi-ts": { output: "models.yaml" } },
      reader: { root: "reader.yaml", "x-openapi-ts": { output: "reader.ts" } },
    });
    cli.files.files.set(fakePath("/work/api/models.yaml"), "M: { type: string }");
    cli.generator.readFiles.set(fakeUrl("/work/api/reader.yaml"), [new URL(fakeUrl("/work/api/models.yaml"))]);

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      `API writer: The output models.yaml is the schema ${["api", "models.yaml"].join(sep)} that API reader reads: writing ` +
        "the types would overwrite it. Choose another output file. (CLI_OUTPUT_IS_INPUT)",
    ]);
    expect(cli.files.files.get(fakePath("/work/api/models.yaml"))).toBe("M: { type: string }");
    expect(cli.files.files.get(fakePath("/work/api/reader.ts"))).toBe(`types of ${fakeUrl("/work/api/reader.yaml")}`);
  });
});
