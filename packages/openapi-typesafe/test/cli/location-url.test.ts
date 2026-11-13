import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig } from "../fakes/cli-dependencies.js";

/** A location with a URL scheme that does not parse as a URL is a usage error, not a crash. */

const BAD_URL = "http://tok:URL/SECRET@[::1/x.yaml";
const SHOWN = "The location http://***@[::1/x.yaml is not a valid URL (CLI_LOCATION_INVALID)";

describe("runCli: a location that is not a valid URL", () => {
  it("runCli with an input that is not a valid URL exits with 2 and hides its secrets", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli([BAD_URL, "-o", "out.ts"], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.generator.calls).toEqual([]);
    expect(cli.logger.messages("error")).toEqual([SHOWN]);
  });

  it("runCli with a Redocly root that is not a valid URL fails that API by name", async () => {
    const config = fakePath("/work/redocly.yaml");
    const cli = createFakeCli();
    const apis = {
      bad: { root: BAD_URL, "x-openapi-ts": { output: "bad.ts" } },
      good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
    };
    cli.redoclyConfigs.configs.set(config, fakeRedoclyConfig(apis, config));
    cli.redoclyConfigs.found = config;

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([`API bad: ${SHOWN}`]);
    expect(cli.generator.calls.map((call) => call.apiName)).toEqual(["good"]);
  });
});
