import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig } from "../fakes/cli-dependencies.js";

/**
 * Two API outputs whose names differ but that the file system stores as one file (ADR-043,
 * decision 1). The names alone cannot tell; claiming the outputs before writing does.
 */

const CONFIG_PATH = fakePath("/work/api/redocly.yaml");

function cliWithOutputs(first: string, second: string) {
  const cli = createFakeCli();
  const apis = {
    a: { root: "a.yaml", "x-openapi-ts": { output: first } },
    b: { root: "b.yaml", "x-openapi-ts": { output: second } },
    own: { root: "own.yaml", "x-openapi-ts": { output: "own.ts" } },
  };
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

/** Outputs that one file on disk holds, in the forms the hunt found (N-dup-unicode). */
const ONE_FILE_ON_DISK = [
  ["NFC and NFD names", "g1/café.ts", "g1/café.ts"],
  ["ß and SS (full case folding)", "g2/straße.ts", "g2/STRASSE.ts"],
  ["a directory without letters to probe", "_/Types.ts", "_/types.ts"],
  ["a link to a missing directory", "link/x.ts", "missingdir/x.ts"],
] as const;

describe("runCli: API outputs that only the file system knows are one file", () => {
  it.each(ONE_FILE_ON_DISK)(
    "runCli with %s fails both APIs with CLI_OUTPUT_DUPLICATE and leaves no file",
    async (_case, first, second) => {
      const cli = cliWithOutputs(first, second);
      cli.files.sameOnDisk.set(fakePath(`/work/api/${second}`), fakePath(`/work/api/${first}`));

      const exitCode = await runCli([], cli.deps);

      expect(exitCode).toBe(2);
      expect(cli.logger.messages("error")).toEqual([
        `The output ${first} of API a is also the output of API b: they would overwrite each ` +
          "other. Give each API its own output file. (CLI_OUTPUT_DUPLICATE)",
        `The output ${second} of API b is also the output of API a: they would overwrite each ` +
          "other. Give each API its own output file. (CLI_OUTPUT_DUPLICATE)",
      ]);
      expect([...cli.files.files.keys()]).toEqual([fakePath("/work/api/own.ts")]);
    },
  );

  it("runCli keeps an existing file that two APIs claim, with its content", async () => {
    const cli = cliWithOutputs("g/café.ts", "g/café.ts");
    const stored = fakePath("/work/api/g/café.ts");
    cli.files.sameOnDisk.set(fakePath("/work/api/g/café.ts"), stored);
    cli.files.files.set(stored, "old types");

    await runCli([], cli.deps);

    expect(cli.files.files.get(stored)).toBe("old types");
  });

  it("runCli with outputs that are two files writes both", async () => {
    const cli = cliWithOutputs("g/a.ts", "g/b.ts");

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.files.files.get(fakePath("/work/api/g/b.ts"))).toContain("types of");
  });

  it("runCli with a claim that fails fails that API only", async () => {
    const cli = cliWithOutputs("a.ts", "b.ts");
    cli.files.claimFailures.add(fakePath("/work/api/a.ts"));

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(4);
    expect(cli.logger.messages("error").join("\n")).toContain("claim failed");
    expect(cli.files.files.has(fakePath("/work/api/b.ts"))).toBe(true);
  });

  it("runCli with a write that fails releases its claim, so no empty file is left", async () => {
    const cli = cliWithOutputs("a.ts", "b.ts");
    cli.files.writeFailures.add(fakePath("/work/api/a.ts"));

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(4);
    expect(cli.files.files.has(fakePath("/work/api/a.ts"))).toBe(false);
    expect(cli.files.files.has(fakePath("/work/api/b.ts"))).toBe(true);
  });

  it("runCli --check claims nothing and compares each output", async () => {
    const cli = cliWithOutputs("a.ts", "b.ts");

    const exitCode = await runCli(["--check"], cli.deps);

    expect(exitCode).toBe(4);
    expect(cli.files.claimed).toEqual([]);
  });
});
