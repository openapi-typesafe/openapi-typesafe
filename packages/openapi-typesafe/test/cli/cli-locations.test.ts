import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveLocationUrl } from "../../src/cli/cli-output.js";
import { runCli } from "../../src/cli/run-cli.js";
import { createFakeCli, FAKE_CWD, fakePath, fakeRedoclyConfig } from "../fakes/cli-dependencies.js";

/** A directory name with every character that a URL parser would read as syntax. */
const SPECIAL_DIRECTORY = "a b #c%20d?e";

describe("resolveLocationUrl", () => {
  it("resolveLocationUrl with a relative path keeps # ? and % in the file name", () => {
    const url = resolveLocationUrl(`${SPECIAL_DIRECTORY}/api.yaml`, FAKE_CWD);

    expect(url).toEqual(pathToFileURL(fakePath(`/work/${SPECIAL_DIRECTORY}/api.yaml`)));
    expect(url.hash).toBe("");
    expect(url.search).toBe("");
  });

  it("resolveLocationUrl with an absolute path ignores the base", () => {
    expect(resolveLocationUrl(fakePath("/elsewhere/api.yaml"), FAKE_CWD)).toEqual(
      pathToFileURL(fakePath("/elsewhere/api.yaml")),
    );
  });

  it("resolveLocationUrl with a file URL base resolves next to that file", () => {
    const configFile = pathToFileURL(fakePath("/work/api/redocly.yaml"));

    expect(resolveLocationUrl("../out.ts", configFile)).toEqual(pathToFileURL(fakePath("/work/out.ts")));
  });

  it("resolveLocationUrl with a URL returns it unchanged", () => {
    expect(resolveLocationUrl("https://example.com/a.yaml#x", FAKE_CWD).href).toBe("https://example.com/a.yaml#x");
  });

  it("resolveLocationUrl with a Windows drive path does not read the drive as a URL scheme", () => {
    const url = resolveLocationUrl("C:\\specs\\api.yaml", FAKE_CWD);

    expect(url.protocol).toBe("file:");
    expect(url).toEqual(pathToFileURL(path.resolve(fakePath("/work"), "C:\\specs\\api.yaml")));
  });
});

describe("runCli: paths with URL syntax characters", () => {
  it("runCli with # in the schema path reads that file", async () => {
    const cli = createFakeCli();

    await runCli([`${SPECIAL_DIRECTORY}/api.yaml`], cli.deps);

    expect(cli.generator.calls[0]?.source).toEqual(pathToFileURL(fakePath(`/work/${SPECIAL_DIRECTORY}/api.yaml`)));
  });

  it("runCli with # in --output writes that file", async () => {
    const cli = createFakeCli();

    await runCli(["a.yaml", "-o", `${SPECIAL_DIRECTORY}/types.ts`], cli.deps);

    expect([...cli.files.files.keys()]).toEqual([fakePath(`/work/${SPECIAL_DIRECTORY}/types.ts`)]);
  });

  it("runCli with # in a redocly api root and output resolves them next to the config", async () => {
    const cli = createFakeCli();
    const configPath = fakePath("/work/api/redocly.yaml");
    const api = { root: `${SPECIAL_DIRECTORY}/api.yaml`, "x-openapi-ts": { output: `${SPECIAL_DIRECTORY}/api.ts` } };
    cli.redoclyConfigs.configs.set(configPath, fakeRedoclyConfig({ api }, configPath));
    cli.redoclyConfigs.found = configPath;

    await runCli([], cli.deps);

    const directory = fakePath(`/work/api/${SPECIAL_DIRECTORY}`);
    expect(cli.generator.calls[0]?.source).toEqual(pathToFileURL(path.join(directory, "api.yaml")));
    expect([...cli.files.files.keys()]).toEqual([path.join(directory, "api.ts")]);
  });
});
