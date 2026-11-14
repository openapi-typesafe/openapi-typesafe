import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, fakePath, fakeRedoclyConfig, fakeUrl } from "../fakes/cli-dependencies.js";

/**
 * An API's `x-openapi-ts.output` in `redocly.yaml`: a missing key is reported as missing, a value
 * that is set but names no file (`""`, `0`, `false`) as an invalid setting, so the message points
 * at the value the user wrote.
 */

const CONFIG_PATH = fakePath("/work/api/redocly.yaml");
const NO_FILE_PATH = "API api: `output` in x-openapi-ts must be a file path (CLI_CONFIG_INVALID)";

/** A CLI whose `redocly.yaml` defines the API `api` with these settings, and the API `good`. */
function cliWithApiSettings(settings: unknown) {
  const cli = createFakeCli();
  const apis = {
    api: { root: "api.yaml", "x-openapi-ts": settings },
    good: { root: "good.yaml", "x-openapi-ts": { output: "good.ts" } },
  };
  cli.redoclyConfigs.configs.set(CONFIG_PATH, fakeRedoclyConfig(apis, CONFIG_PATH));
  cli.redoclyConfigs.found = CONFIG_PATH;
  return cli;
}

describe("runCli: the output setting of an API", () => {
  it.each([0, false, null, true])(
    "runCli with the API output %j fails that API with CLI_CONFIG_INVALID",
    async (output) => {
      const cli = cliWithApiSettings({ output });

      expect(await runCli([], cli.deps)).toBe(2);
      expect(cli.logger.messages("error")).toEqual([NO_FILE_PATH]);
      expect(cli.generator.calls.map((call) => String(call.source))).toEqual([fakeUrl("/work/api/good.yaml")]);
    },
  );

  it("runCli with an empty API output fails that API with CLI_CONFIG_INVALID", async () => {
    const cli = cliWithApiSettings({ output: "" });

    expect(await runCli([], cli.deps)).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "API api: `output` in x-openapi-ts must be a file path, not empty (CLI_CONFIG_INVALID)",
    ]);
  });

  it.each([{}, undefined])(
    "runCli with the API settings %j fails that API with CLI_CONFIG_OUTPUT_MISSING",
    async (settings) => {
      const cli = cliWithApiSettings(settings);

      expect(await runCli([], cli.deps)).toBe(2);
      const [message] = cli.logger.messages("error");
      expect(message).toMatch(/^API api is missing an `x-openapi-ts\.output` key\. /);
      expect(message).toMatch(/\(CLI_CONFIG_OUTPUT_MISSING\)$/);
    },
  );
});
