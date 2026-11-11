import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";
import { hasUrlScheme } from "../../src/domain/location-text.js";
import { createFakeCli, fakePath, fakeUrl } from "../fakes/cli-dependencies.js";

describe("hasUrlScheme", () => {
  it.each([
    "https://example.com/a.yaml",
    "HTTP://example.com/a.yaml",
    "file:api.yaml",
    "FILE:api.yaml",
    "file:///a.yaml",
    "s3://b/a",
  ])("hasUrlScheme with %s is true", (location) => {
    expect(hasUrlScheme(location)).toBe(true);
  });

  it.each([
    "out:v2.ts",
    "spec:v2.yaml",
    "C:\\specs\\a.yaml",
    "a.yaml",
    "mailto:x",
    "s3:/b/a",
    "out:v2//x.ts",
  ])("hasUrlScheme with %s is false", (location) => {
    expect(hasUrlScheme(location)).toBe(false);
  });
});

describe("runCli: a path with a colon", () => {
  it("runCli with -o out:v2.ts and the schema spec:v2.yaml reads and writes those files", async () => {
    const cli = createFakeCli();

    const exitCode = await runCli(["spec:v2.yaml", "-o", "out:v2.ts"], cli.deps);

    expect(exitCode).toBe(0);
    expect(cli.generator.calls.map((call) => String(call.source))).toEqual([
      fakeUrl("/work/spec:v2.yaml"),
    ]);
    expect([...cli.files.files.keys()]).toEqual([fakePath("/work/out:v2.ts")]);
  });
});
