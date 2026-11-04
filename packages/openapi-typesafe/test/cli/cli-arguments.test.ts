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
      refLimits: {},
      unknownFlags: [],
    });
  });

  it("parseCliArguments reads the $ref limits; a port-like host stays a string", () => {
    const args = parseCliArguments([
      "a.yaml",
      "--local-ref-root",
      "schemas",
      "--remote-ref-hosts",
      "api.example.com, localhost:8080",
      "--remote-ref-hosts",
      "8080",
    ]);

    expect(args.input).toBe("a.yaml");
    expect(args.refLimits).toEqual({
      localRefRoot: "schemas",
      remoteRefHosts: ["api.example.com", "localhost:8080", "8080"],
    });
  });

  it("parseCliArguments with an empty --remote-ref-hosts allows no host", () => {
    expect(parseCliArguments(["--remote-ref-hosts="]).refLimits).toEqual({ remoteRefHosts: [] });
  });

  it("parseCliArguments uses the last --local-ref-root and accepts camelCase", () => {
    const args = parseCliArguments(["--localRefRoot", "a", "--local-ref-root", "b"]);

    expect(args.refLimits).toEqual({ localRefRoot: "b" });
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

  it("parseCliArguments reads --no-lint as lint: false and keeps the input", () => {
    const args = parseCliArguments(["--no-lint", "schema.yaml"]);

    expect(args.generatorFlags).toEqual({ lint: false });
    expect(args.input).toBe("schema.yaml");
  });

  it("parseCliArguments reads --binary-as-blob as a flag and keeps the input", () => {
    const args = parseCliArguments(["--binary-as-blob", "schema.yaml"]);

    expect(args.generatorFlags).toEqual({ binaryAsBlob: true });
    expect(args.input).toBe("schema.yaml");
  });

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

describe("parseCliArguments removed flags", () => {
  it.each([
    ["-ap", "--additional-properties"],
    ["--immutable-types", "--immutable"],
    ["--support-array-length", "--array-length"],
    ["-it", "--immutable"],
    ["--redoc", "--redocly"],
  ])("parseCliArguments with %s names the current flag %s", (flag, current) => {
    expect(() => parseCliArguments([flag])).toThrow(`"${current}"`);
  });
});

describe("unknown flags", () => {
  it("parseCliArguments lists unknown flags once each, as written", () => {
    const args = parseCliArguments(["schema.yaml", "--alphabetise", "--bogus-flag=1", "-x", "--no-thing"]);

    expect(args.unknownFlags).toEqual(["--alphabetise", "--bogus-flag", "-x", "--no-thing"]);
  });

  it("parseCliArguments knows every flag of the help text", () => {
    const args = parseCliArguments([
      "schema.yaml",
      ...GENERATOR_FLAGS.map((flag) => `--${kebabCase(flag)}`),
      ...["--check", "--content-never", "--help", "--version", "--no-alphabetize"],
      ...["-o", "out.ts", "-c", "redocly.yaml", "-t", "--output", "o.ts", "--redocly", "r.yaml"],
      ...["--local-ref-root", "api", "--remote-ref-hosts", "a.example", "--exportType"],
    ]);

    expect(args.unknownFlags).toEqual([]);
  });
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
