import { kebabCase } from "scule";
import { describe, expect, it } from "vitest";
import { GENERATOR_FLAGS, ineffectiveFlagNotices, parseCliArguments } from "../../src/cli/cli-arguments.js";

describe("parseCliArguments", () => {
  it("parseCliArguments with no arguments reads stdin to stdout", () => {
    expect(parseCliArguments([])).toEqual({
      input: undefined,
      output: undefined,
      redocly: undefined,
      isCheck: false,
      isHelp: false,
      isVersion: false,
      generatorFlags: {},
    });
  });

  it("parseCliArguments reads the input, the short aliases and --check", () => {
    const args = parseCliArguments(["a.yaml", "-o", "out.ts", "-c", "r.yaml", "-t", "--check"]);

    expect(args).toMatchObject({
      input: "a.yaml",
      output: "out.ts",
      redocly: "r.yaml",
      isCheck: true,
      generatorFlags: { exportType: true },
    });
  });

  it("parseCliArguments keeps only the generator flags that were given", () => {
    const args = parseCliArguments(["--enum", "--default-non-nullable=false", "--root-types"]);

    expect(args.generatorFlags).toEqual({
      enum: true,
      defaultNonNullable: false,
      rootTypes: true,
    });
  });

  // Upstream #2523, #1651, #2764, #2694: the flag took the path as its value, so the CLI read stdin.
  it.each([...GENERATOR_FLAGS, "check", "contentNever"])(
    "parseCliArguments with --%s in kebab-case before the input keeps the input",
    (flag) => {
      const args = parseCliArguments([`--${kebabCase(flag)}`, "schema.yaml"]);

      expect(args.input).toBe("schema.yaml");
    },
  );

  it("parseCliArguments reads --help and --version", () => {
    expect(parseCliArguments(["--help"]).isHelp).toBe(true);
    expect(parseCliArguments(["--version"]).isVersion).toBe(true);
  });

  it.each([["-ap"], ["--immutable-types"], ["--support-array-length"], ["-it"], ["--redoc"]])(
    "parseCliArguments with the removed flag %s fails with CLI_FLAG_REMOVED",
    (flag) => {
      expect(() => parseCliArguments([flag])).toThrow(expect.objectContaining({ code: "CLI_FLAG_REMOVED" }));
    },
  );
});

describe("ineffectiveFlagNotices", () => {
  it("ineffectiveFlagNotices names each root-types flag given without --root-types", () => {
    expect(ineffectiveFlagNotices(["--root-types-no-schema-prefix", "--root-types-keep-casing"])).toEqual([
      "--root-types-no-schema-prefix has no effect without --root-types flag",
      "--root-types-keep-casing has no effect without --root-types flag",
    ]);
  });

  it("ineffectiveFlagNotices is empty with --root-types", () => {
    expect(ineffectiveFlagNotices(["--root-types", "--root-types-keep-casing"])).toEqual([]);
  });
});
