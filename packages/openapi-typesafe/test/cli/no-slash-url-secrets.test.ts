import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, type FakeCli, fakePath, fakeRedoclyConfig } from "../fakes/cli-dependencies.js";

/**
 * The loader fetches a URL written without `//` (`http:host/api.yaml`, `http:\\host\api.yaml`),
 * so every CLI line that names such a location hides its query and user info as for any URL. A
 * `://` in its query does not start the URL there, so the query before it stays hidden too.
 */

const SECRET = "URL-SECRET";
const CONFIG_PATH = fakePath("/work/api/redocly.yaml");

/** Spellings of one URL that the loader reads as a URL, and how each line shows it. */
const SPELLINGS: ReadonlyArray<readonly [string, string]> = [
  [`http:h/a.yaml?key=${SECRET}`, "http:h/a.yaml?***"],
  [`http:/h/a.yaml?key=${SECRET}`, "http:/h/a.yaml?***"],
  [`http:\\\\h\\a.yaml?key=${SECRET}`, "http:\\\\h\\a.yaml?***"],
  [`HTTP:h/a.yaml?key=${SECRET}`, "HTTP:h/a.yaml?***"],
  [`https:h/a.yaml?key=${SECRET}`, "https:h/a.yaml?***"],
  [`http:tok:${SECRET}@h/a.yaml`, "http:***@h/a.yaml"],
  [`http:h/a.yaml?key=${SECRET}#/x`, "http:h/a.yaml?***#/x"],
  [`http:h/a.yaml?key=${SECRET}&next=http://h2/b`, "http:h/a.yaml?***"],
];

/** Spellings that do not parse as a URL, and how the error shows each. */
const UNPARSED_SPELLINGS: ReadonlyArray<readonly [string, string]> = [
  [`http:[::1/x?key=${SECRET}`, "http:[::1/x?***"],
  [`http:\\\\tok:${SECRET}@[::1\\x`, "http:\\\\***@[::1\\x"],
  [`HTTPS:tok:${SECRET}@[::1/x?key=${SECRET}`, "HTTPS:***@[::1/x?***"],
];

/** Every line the CLI printed or logged. */
function printed(cli: FakeCli): string {
  const logged = cli.logger.lines.map((line) => line.message);
  return [...cli.console.infoLines, ...cli.console.noticeLines, ...logged].join("\n");
}

function cliWithRoot(root: string): FakeCli {
  const cli = createFakeCli();
  const apis = { main: { root, "x-openapi-ts": { output: "a.ts" } } };
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

describe.each(SPELLINGS)("runCli: the URL %j written without //", (written, shown) => {
  it("runCli prints the line for a written file with its secrets hidden", async () => {
    const cli = createFakeCli();

    await runCli([written, "-o", "a.ts"], cli.deps);

    expect(cli.console.infoLines.at(-1)).toBe(`🚀 ${shown} → *a.ts* [5ms]`);
  });

  it("runCli with two schema arguments hides the secrets of each", async () => {
    const cli = createFakeCli();

    await runCli([written, written], cli.deps);

    expect(cli.logger.messages("error")[0]).toContain(`given: ${shown} ${shown}.`);
    expect(printed(cli)).not.toContain(SECRET);
  });

  it("runCli with it as the output hides its secrets", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "-o", written], cli.deps);

    expect(cli.logger.messages("error")[0]).toBe(
      `The output ${shown} is not a local file. Write the types to a file path or a file: URL. ` +
        "(CLI_OUTPUT_INVALID)",
    );
  });

  it("runCli with it as --redocly hides its secrets", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "--redocly", written], cli.deps);

    expect(cli.logger.messages("error")).toEqual([`Redocly config not found at: ${shown} (CLI_CONFIG_NOT_FOUND)`]);
  });

  it("runCli with it as --local-ref-root hides its secrets", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "--local-ref-root", written], cli.deps);

    expect(cli.logger.messages("error")[0]).toContain(`--local-ref-root ${shown}: `);
    expect(printed(cli)).not.toContain(SECRET);
  });
});

describe.each(UNPARSED_SPELLINGS)("runCli: the location %j that does not parse", (written, shown) => {
  it("runCli with it as the schema hides its secrets", async () => {
    const cli = createFakeCli();

    await runCli([written, "-o", "a.ts"], cli.deps);

    expect(cli.logger.messages("error")).toEqual([`The location ${shown} is not a valid URL (CLI_LOCATION_INVALID)`]);
  });

  it("runCli with it as the root of an API hides its secrets", async () => {
    const cli = cliWithRoot(written);

    await runCli([], cli.deps);

    expect(cli.logger.messages("error")[0]).toContain(`The location ${shown} is not a valid URL`);
    expect(printed(cli)).not.toContain(SECRET);
  });
});
