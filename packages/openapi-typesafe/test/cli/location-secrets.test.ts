import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, type FakeCli, fakePath, fakeRedoclyConfig, fakeUrl } from "../fakes/cli-dependencies.js";

/**
 * Every CLI line that names a location the user wrote (the schema, an output, a flag, an API's
 * root) hides the query of a URL as a whole, also after a space or a quote in it: the location
 * is one URL as written, not free text in which a space ends a URL.
 */

const SECRET = "URL-SECRET";
const QUERY = `?key=se cret'${SECRET}`;
const REMOTE = `https://example.com/my 'a.yaml${QUERY}`;
const REMOTE_SHOWN = "https://example.com/my 'a.yaml?***";
const CONFIG_PATH = fakePath("/work/api/redocly.yaml");

/** Every line the CLI printed or logged. */
function printed(cli: FakeCli): string {
  const logged = cli.logger.lines.map((line) => line.message);
  return [...cli.console.infoLines, ...cli.console.noticeLines, ...logged].join("\n");
}

function cliWithApis(apis: Record<string, Record<string, unknown>>): FakeCli {
  const cli = createFakeCli();
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

describe("runCli: locations with a space and a quote in their query", () => {
  it("runCli prints the line for a written file with the query of the source URL hidden", async () => {
    const cli = createFakeCli();

    await runCli([REMOTE, "-o", "a.ts"], cli.deps);

    expect(cli.console.infoLines.at(-1)).toBe(`🚀 ${REMOTE_SHOWN} → *a.ts* [5ms]`);
  });

  it("runCli prints the line for a written file with the query of a file: output hidden", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "-o", `${fakeUrl("/work/a.ts")}${QUERY}`], cli.deps);

    expect(cli.console.infoLines.at(-1)).toBe(`🚀 a.yaml → *${fakeUrl("/work/a.ts")}?**** [5ms]`);
  });

  it("runCli with an output URL of another protocol hides its query", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "-o", REMOTE], cli.deps);

    expect(cli.logger.messages("error")).toEqual([
      `The output ${REMOTE_SHOWN} is not a local file. Write the types to a file path or a ` +
        "file: URL. (CLI_OUTPUT_INVALID)",
    ]);
  });

  it("runCli with two schema arguments hides the query of each", async () => {
    const cli = createFakeCli();

    await runCli([REMOTE, REMOTE], cli.deps);

    expect(cli.logger.messages("error")[0]).toContain(`given: ${REMOTE_SHOWN} ${REMOTE_SHOWN}.`);
    expect(printed(cli)).not.toContain(SECRET);
  });

  it("runCli with a --redocly URL that names no config hides its query", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "--redocly", REMOTE], cli.deps);

    expect(cli.logger.messages("error")).toEqual([
      `Redocly config not found at: ${REMOTE_SHOWN} (CLI_CONFIG_NOT_FOUND)`,
    ]);
  });

  it("runCli with a --local-ref-root URL of another protocol hides its query", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "--local-ref-root", REMOTE], cli.deps);

    expect(cli.logger.messages("error")[0]).toMatch(/^--local-ref-root https:\/\/example\.com\/my 'a\.yaml\?\*\*\*: /);
    expect(printed(cli)).not.toContain(SECRET);
  });

  it("runCli with a schema that is its output hides the query of the schema", async () => {
    const cli = createFakeCli();

    await runCli([`${fakeUrl("/work/a.yaml")}${QUERY}`, "-o", "a.yaml"], cli.deps);

    expect(cli.logger.messages("error")[0]).toContain(`is the schema ${fakeUrl("/work/a.yaml")}?***:`);
    expect(printed(cli)).not.toContain(SECRET);
  });

  it("runCli with an output file: URL that is the schema hides the query of the output", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "-o", `${fakeUrl("/work/a.yaml")}${QUERY}`], cli.deps);

    expect(cli.logger.messages("error")[0]).toContain(`The output ${fakeUrl("/work/a.yaml")}?*** is the schema`);
    expect(printed(cli)).not.toContain(SECRET);
  });

  it("runCli --check with a stale file: output hides its query", async () => {
    const cli = createFakeCli();
    cli.files.files.set(fakePath("/work/a.ts"), "old");

    await runCli(["a.yaml", "-o", `${fakeUrl("/work/a.ts")}${QUERY}`, "--check"], cli.deps);

    expect(cli.logger.messages("error")).toEqual([
      `Generated types are not up-to-date! ${fakeUrl("/work/a.ts")}?*** differs from its schema. (OUTPUT_STALE)`,
    ]);
  });

  it("runCli with an API root that is its output hides the query of the root", async () => {
    const cli = cliWithApis({
      main: { root: `${fakeUrl("/work/api/a.yaml")}${QUERY}`, "x-openapi-ts": { output: "a.yaml" } },
    });

    await runCli([], cli.deps);

    expect(cli.logger.messages("error")[0]).toContain(`schema ${fakeUrl("/work/api/a.yaml")}?*** of API main`);
    expect(printed(cli)).not.toContain(SECRET);
  });

  it("runCli with two APIs writing one file: URL hides its query", async () => {
    const output = `${fakeUrl("/work/api/a.ts")}${QUERY}`;
    const cli = cliWithApis({
      first: { root: "first.yaml", "x-openapi-ts": { output } },
      second: { root: "second.yaml", "x-openapi-ts": { output } },
    });

    await runCli([], cli.deps);

    expect(cli.logger.messages("error")[0]).toContain(`The output ${fakeUrl("/work/api/a.ts")}?*** is also`);
    expect(printed(cli)).not.toContain(SECRET);
  });

  it("runCli with APIs and an --output URL warns with its query hidden", async () => {
    const cli = cliWithApis({ main: { root: "a.yaml", "x-openapi-ts": { output: "a.ts" } } });

    await runCli(["-o", REMOTE], cli.deps);

    expect(cli.logger.messages("warn")[0]).toContain(`so --output ${REMOTE_SHOWN} is ignored`);
    expect(printed(cli)).not.toContain(SECRET);
  });
});

describe("runCli: the schema as written", () => {
  it("runCli passes the schema argument as written to the generator", async () => {
    const cli = createFakeCli();

    await runCli([REMOTE, "-o", "a.ts"], cli.deps);

    expect(cli.generator.calls.map(({ source, written }) => [String(source), written])).toEqual([
      [new URL(REMOTE).href, REMOTE],
    ]);
  });

  it("runCli passes the root of an API as written to the generator", async () => {
    const cli = cliWithApis({ main: { root: REMOTE, "x-openapi-ts": { output: "a.ts" } } });

    await runCli([], cli.deps);

    expect(cli.generator.calls.map(({ written }) => written)).toEqual([REMOTE]);
  });

  it("runCli passes no text as written for stdin", async () => {
    const cli = createFakeCli();

    await runCli(["-o", "a.ts"], cli.deps);

    expect(cli.generator.calls.map(({ written }) => written)).toEqual([undefined]);
  });
});
