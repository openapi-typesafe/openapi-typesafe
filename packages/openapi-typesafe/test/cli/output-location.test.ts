import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig, fakeUrl } from "../fakes/cli-dependencies.js";

/** An output that is no local file, or a directory, fails before anything is generated. */

const CONFIG_PATH = fakePath("/work/api/redocly.yaml");

function cliWithApis(apis: Record<string, Record<string, unknown>>) {
  const cli = createFakeCli();
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

describe("runCli: an output that is a directory", () => {
  it("runCli with -o dir/ exits with 2 and writes no file named like the directory (G3)", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "-o", "newdir/"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.generator.calls).toEqual([]);
    expect([...cli.files.files.keys()]).toEqual([]);
    expect(cli.logger.messages("error")).toEqual([
      "The output newdir/ is a directory. Name the file to write the types to in it. (CLI_OUTPUT_INVALID)",
    ]);
  });

  it("runCli with -o naming an existing directory exits with 2", async () => {
    const cli = createFakeCli();
    cli.files.directories.add(fakePath("/work/gen"));

    const exitCode = await runCli(["a.yaml", "-o", "gen"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("(CLI_OUTPUT_INVALID)");
  });

  it("runCli with -o . (the working directory) exits with 2", async () => {
    const cli = createFakeCli();
    cli.files.files.set(fakePath("/work/a.yaml"), "openapi: 3.1.0");

    expect(await runCli(["a.yaml", "-o", "."], cli.deps)).toBe(2);
  });

  it.each(["newdir/.", "a/b/..", `${fakeUrl("/work/gen")}/.`, `${fakeUrl("/work/gen")}/%2E`, "gen/./.."])(
    "runCli with -o %s (a last segment . or ..) exits with 2 and writes nothing",
    async (output) => {
      const cli = createFakeCli();

      const exitCode = await runCli(["a.yaml", "-o", output], cli.deps);

      expect(exitCode).toBe(2);
      expect([...cli.files.files.keys()]).toEqual([]);
      expect(cli.logger.messages("error")).toEqual([
        `The output ${output} is a directory. Name the file to write the types to in it. (CLI_OUTPUT_INVALID)`,
      ]);
    },
  );

  it("runCli with an API output ./gen/. fails that API only", async () => {
    const cli = cliWithApis({
      dir: { root: "dir.yaml", "x-openapi-ts": { output: "./gen/." } },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect([...cli.files.files.keys()]).toEqual([fakePath("/work/api/good.ts")]);
  });

  it("runCli with -o naming a file that starts with dots writes it", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "-o", "gen/..types.ts"], cli.deps);

    expect(exitCode).toBe(0);
    expect([...cli.files.files.keys()]).toEqual([fakePath("/work/gen/..types.ts")]);
  });

  it("runCli with an API output ending in a separator fails that API only", async () => {
    const cli = cliWithApis({
      dir: { root: "dir.yaml", "x-openapi-ts": { output: "./gen/" } },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "API dir: The output ./gen/ is a directory. Name the file to write the types to in it. (CLI_OUTPUT_INVALID)",
    ]);
    expect([...cli.files.files.keys()]).toEqual([fakePath("/work/api/good.ts")]);
  });
});

describe("runCli: an output that is no local file", () => {
  it("runCli with an https: output exits with 2 instead of an unexpected error (G4)", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["a.yaml", "-o", "https://example.invalid/out.ts"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.generator.calls).toEqual([]);
    expect(cli.logger.messages("error")).toEqual([
      "The output https://example.invalid/out.ts is not a local file. Write the types to a file path " +
        "or a file: URL. (CLI_OUTPUT_INVALID)",
    ]);
  });

  it("runCli --check with an https: output exits with 2", async () => {
    const cli = createFakeCli();

    expect(await runCli(["a.yaml", "-o", "https://example.invalid/out.ts", "--check"], cli.deps)).toBe(2);
  });

  it("runCli with an output URL that does not parse exits with 2", async () => {
    const cli = createFakeCli();

    expect(await runCli(["a.yaml", "-o", "https://"], cli.deps)).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("(CLI_OUTPUT_INVALID)");
  });

  it("runCli with a file: URL that names no local path exits with 2", async () => {
    const cli = createFakeCli();
    const output = "file://server/share/%2F/out.ts";

    expect(await runCli(["a.yaml", "-o", output], cli.deps)).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      `The output ${output} names no file on this computer. Use a file path instead. (CLI_OUTPUT_INVALID)`,
    ]);
  });

  it("runCli with a non-file x-openapi-ts.output fails that API only", async () => {
    const cli = cliWithApis({
      remote: { root: "remote.yaml", "x-openapi-ts": { output: "https://example.invalid/out.ts" } },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
    });

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")[0]).toContain("(CLI_OUTPUT_INVALID)");
    expect([...cli.files.files.keys()]).toEqual([fakePath("/work/api/good.ts")]);
  });
});
