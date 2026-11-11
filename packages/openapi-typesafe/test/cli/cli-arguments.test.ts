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
  const notices = (argv: string[]) => ineffectiveFlagNotices(parseCliArguments(argv).generatorFlags);

  it("ineffectiveFlagNotices names each root-types flag given without --root-types", () => {
    expect(notices(["--root-types-no-schema-prefix", "--rootTypesKeepCasing=true"])).toEqual([
      "--root-types-no-schema-prefix has no effect without --root-types flag",
      "--root-types-keep-casing has no effect without --root-types flag",
    ]);
  });

  it.each([["--root-types"], ["--rootTypes"], ["--root-types=true"]])(
    "ineffectiveFlagNotices is empty with %s",
    (flag) => {
      expect(notices([flag, "--root-types-keep-casing"])).toEqual([]);
    },
  );

  it("ineffectiveFlagNotices names the root-types flags when --root-types=false", () => {
    expect(notices(["--root-types=false", "--root-types-keep-casing"])).toEqual([
      "--root-types-keep-casing has no effect without --root-types flag",
    ]);
  });

  it("ineffectiveFlagNotices is empty when the root-types flags are off", () => {
    expect(notices(["--root-types-keep-casing=false", "--no-root-types-no-schema-prefix"])).toEqual([]);
  });
});

describe("parseCliArguments flags with values", () => {
  it.each([
    "--redoc=redocly.yaml",
    "--immutable-types=true",
    "--support-array-length=false",
    "--immutableTypes",
    "--supportArrayLength=true",
    "--no-immutable-types",
  ])("parseCliArguments fails with CLI_FLAG_REMOVED for %s", (flag) => {
    expect(() => parseCliArguments([flag])).toThrow(expect.objectContaining({ code: "CLI_FLAG_REMOVED" }));
  });

  it.each(["--enum=1", "--alphabetize=yes", "--rootTypes=on", "--check=", "--no-enum=true", "-t=yes", "-t=1"])(
    "parseCliArguments fails with CLI_FLAG_INVALID for %s",
    (flag) => {
      expect(() => parseCliArguments(["schema.yaml", flag])).toThrow(
        expect.objectContaining({ code: "CLI_FLAG_INVALID" }),
      );
    },
  );

  it("parseCliArguments takes true and false as the values of a boolean alias", () => {
    expect(parseCliArguments(["-t=true"]).generatorFlags).toEqual({ exportType: true });
    expect(parseCliArguments(["-t=false"]).generatorFlags).toEqual({ exportType: false });
  });

  it("parseCliArguments takes a value of an alias that is no boolean flag", () => {
    expect(parseCliArguments(["-o=out.ts"]).output).toBe("out.ts");
  });

  it("parseCliArguments takes true and false as the values of a boolean flag", () => {
    const args = parseCliArguments(["--enum=true", "--alphabetize=false", "--check=true"]);

    expect(args.generatorFlags).toEqual({ enum: true, alphabetize: false });
    expect(args.isCheck).toBe(true);
  });

  it("parseCliArguments reads an argument after -- as an input, not a flag", () => {
    expect(parseCliArguments(["--", "--enum=1"]).input).toBe("--enum=1");
  });

  it("parseCliArguments takes the last value of a flag given twice", () => {
    const args = parseCliArguments(["-o", "a.ts", "--output", "b.ts", "-c", "x.yaml", "--redocly=y.yaml"]);

    expect([args.output, args.redocly]).toEqual(["b.ts", "y.yaml"]);
  });
});

describe("parseCliArguments negated value flags", () => {
  it.each([
    "--no-output",
    "--no-o",
    "--no-redocly",
    "--no-c",
    "--no-fix",
    "--no-local-ref-root",
    "--no-remoteRefHosts",
  ])("parseCliArguments with %s fails with CLI_FLAG_INVALID", (flag) => {
    expect(() => parseCliArguments(["schema.yaml", flag])).toThrow(
      expect.objectContaining({ code: "CLI_FLAG_INVALID", message: expect.stringContaining(flag) }),
    );
  });

  it("parseCliArguments with a negated boolean flag and its alias keeps working", () => {
    expect(parseCliArguments(["--no-export-type"]).generatorFlags).toEqual({ exportType: false });
  });
});

describe("parseCliArguments schema arguments", () => {
  it("parseCliArguments with two schema arguments fails with CLI_INPUT_EXTRA naming both", () => {
    expect(() => parseCliArguments(["g/a.yaml", "g/b.yaml", "-o", "out.ts"])).toThrow(
      expect.objectContaining({
        code: "CLI_INPUT_EXTRA",
        message: expect.stringContaining("2 were given: g/a.yaml g/b.yaml"),
      }),
    );
  });

  it("parseCliArguments with one schema argument after -- reads it", () => {
    expect(parseCliArguments(["-o", "out.ts", "--", "a.yaml"]).input).toBe("a.yaml");
  });

  it.each(["1.10", "0x10", "1e3", "007"])("parseCliArguments keeps the schema argument %s as written", (input) => {
    expect(parseCliArguments([input]).input).toBe(input);
  });
});

describe("parseCliArguments unknown flags before the schema", () => {
  it.each([
    [["--alphabetise", "specs/api.yaml", "-o", "out.ts"], "--alphabetise"],
    [["--no-thing", "specs/api.yaml"], "--no-thing"],
    [["--fooBar", "specs/api.yaml"], "--foo-bar"],
    [["-x", "specs/api.yaml"], "-x"],
    [["-xt", "specs/api.yaml"], "-x"],
  ])("parseCliArguments with %j keeps the schema and names the unknown flag", (argv, flag) => {
    const args = parseCliArguments(argv);

    expect(args.input).toBe("specs/api.yaml");
    expect(args.unknownFlags).toEqual([flag]);
  });

  it("parseCliArguments with a short group of a known and an unknown flag reads the known one", () => {
    expect(parseCliArguments(["-xt", "a.yaml"]).generatorFlags).toEqual({ exportType: true });
  });

  it("parseCliArguments with an unknown flag and = keeps the value out of the input", () => {
    const args = parseCliArguments(["--bogus=api.yaml", "b.yaml"]);

    expect([args.input, args.unknownFlags]).toEqual(["b.yaml", ["--bogus"]]);
  });
});
