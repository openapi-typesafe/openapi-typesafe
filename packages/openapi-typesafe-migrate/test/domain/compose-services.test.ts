import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { containerServices } from "../../src/domain/compose-services.js";
import { type DocumentValue, usedDocumentValues } from "../../src/domain/config-documents.js";
import type { WordRename } from "../../src/domain/migration-findings.js";
import { COMPOSE_FILE } from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function valuesOf(text: string): DocumentValue[] {
  const read = yaml.read(text);
  return read.kind === "read" ? usedDocumentValues(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const NO_SERVICES: ReadonlySet<string> = new Set();
const migrateCompose = (text: string, outsideServices = NO_SERVICES) =>
  migrateYamlCommands(text, "compose.yaml", valuesOf(text), {
    ...COMPOSE_FILE,
    outsideServices,
  });
const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");
const NAME = { from: "openapi-typescript", to: "openapi-typesafe" };
const FLAG = { from: "-it", to: "--immutable" };
const notKnown = (line: number, renames: WordRename[], unknown = "other-file") => [
  { kind: "container-not-known", location: `compose.yaml:${line}`, unknown, renames },
];

const BASE = [
  "services:",
  "  base:",
  "    image: node:22",
  '    entrypoint: ["npx", "openapi-typescript"]',
  '    command: ["api.yaml", "-o", "out.ts"]',
];

describe("migrateYamlCommands and Compose extends", () => {
  it.each([
    ["a name", "    extends: base"],
    ["a service key", "    extends: { service: base }"],
  ])("migrateYamlCommands pairs a command with the entrypoint that %s extends", (_, extend) => {
    const text = lines(...BASE, "  gen:", extend, '    command: ["api.yaml", "-it"]');

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(renamed(text));
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateYamlCommands follows extends through a service that sets neither key", () => {
    const text = lines(
      ...BASE,
      "  middle:",
      "    extends: base",
      "    environment: { A: 1 }",
      "  gen:",
      "    extends: middle",
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).text).toBe(renamed(text));
  });

  it("migrateYamlCommands reads the own entrypoint of a service before the one it extends", () => {
    const text = lines(
      ...BASE,
      "  gen:",
      "    extends: base",
      '    entrypoint: ["grep"]',
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).text).toBe(
      text.replace('npx", "openapi-typescript', 'npx", "openapi-typesafe'),
    );
  });

  it("migrateYamlCommands reports a command whose entrypoint extends gives from another file", () => {
    const text = lines(
      "services:",
      "  gen:",
      "    extends: { file: base.yaml, service: base }",
      '    command: ["api.yaml", "-it"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual(notKnown(4, [FLAG]));
  });

  it.each([
    ["a service the file does not have", ["  gen:", "    extends: other"]],
    ["itself through another", ["  gen:", "    extends: loop", "  loop:", "    extends: gen"]],
  ])("migrateYamlCommands reports a command whose extends names %s", (_, extend) => {
    const text = lines("services:", ...extend, '    command: ["api.yaml", "-it"]');

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual(
      notKnown(text.split("\n").indexOf('    command: ["api.yaml", "-it"]') + 1, [FLAG]),
    );
  });

  it("migrateYamlCommands reads an extends of another file, not the service of the same name", () => {
    const text = lines(
      ...BASE,
      "  gen:",
      "    extends: { file: other.yaml, service: base }",
      '    command: ["api.yaml", "-it"]',
    );

    const migrated = migrateCompose(text);

    expect(migrated.text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
    expect(migrated.manualSteps).toEqual(notKnown(8, [FLAG]));
  });

  it("migrateYamlCommands pairs a command with the entrypoint that its base merges", () => {
    const text = lines(
      "x-gen: &gen",
      '  entrypoint: ["npx", "openapi-typescript"]',
      "services:",
      "  base:",
      "    <<: *gen",
      "    image: node:22",
      "  gen:",
      "    extends: base",
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).text).toBe(renamed(text));
  });

  it("migrateYamlCommands reads no map but a service as the base an extends names", () => {
    const text = lines(
      'x-gen: { entrypoint: ["npx", "openapi-typescript"] }',
      "services:",
      "  gen:",
      '    extends: ""',
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).manualSteps).toEqual(notKnown(5, [FLAG]));
  });

  it("migrateYamlCommands reads a merge key of a service before the service it extends", () => {
    const text = lines(
      "x-grep: &grep",
      '  entrypoint: ["grep"]',
      ...BASE,
      "  gen:",
      "    <<: *grep",
      "    extends: base",
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
  });

  it("migrateYamlCommands reports a command whose extends names a map outside services", () => {
    const text = lines(
      "x-tools: { base: { image: node } }",
      "services:",
      "  gen:",
      "    extends: base",
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).manualSteps).toEqual(notKnown(5, [FLAG]));
  });

  it("migrateYamlCommands reads a service that sets both keys whatever it extends", () => {
    const text = lines(
      "services:",
      "  gen:",
      "    extends: { file: base.yaml, service: base }",
      '    entrypoint: ["npx", "openapi-typescript"]',
      '    command: ["api.yaml", "-it"]',
    );

    expect(migrateCompose(text).text).toBe(renamed(text));
  });

  it("migrateYamlCommands reads extends in Compose files only", () => {
    const text = lines(...BASE, "  gen:", "    extends: base", '    command: ["api.yaml", "-it"]');

    const migrated = migrateYamlCommands(text, "ci.yml", valuesOf(text));

    expect(migrated.text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
  });
});

describe("migrateYamlCommands and Compose services that another file completes", () => {
  const GEN = [
    "services:",
    "  gen:",
    '    entrypoint: ["npx", "openapi-typescript"]',
    '    command: ["api.yaml", "-it"]',
  ];

  it("migrateYamlCommands reports a service whose entrypoint or command another file sets", () => {
    const text = lines(...GEN);

    const migrated = migrateCompose(text, new Set(["gen"]));

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual(notKnown(4, [NAME, FLAG]));
  });

  it("migrateYamlCommands migrates a map of the same name outside services", () => {
    const text = lines(
      "x-tools:",
      "  gen:",
      '    entrypoint: ["npx", "openapi-typescript"]',
      '    command: ["api.yaml", "-it"]',
      "services:",
      "  gen:",
      "    image: node:22",
    );

    expect(migrateCompose(text, new Set(["gen"])).text).toBe(renamed(text));
  });

  it("migrateYamlCommands migrates the services that no other file completes", () => {
    const text = lines(...GEN);

    expect(migrateCompose(text, new Set(["other"])).text).toBe(renamed(text));
  });

  it("migrateYamlCommands reports a service whose base another file completes", () => {
    const text = lines(...BASE, "  gen:", "    extends: base", '    command: ["api.yaml", "-it"]');

    const migrated = migrateCompose(text, new Set(["base"]));

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual(notKnown(5, [NAME]).concat(notKnown(8, [NAME, FLAG])));
  });

  it("migrateYamlCommands reports the commands of a script that an unknown container starts", () => {
    const text = lines(
      "services:",
      "  gen:",
      '    entrypoint: ["sh", "-c", "npx openapi-typescript \\"$$@\\"", "--"]',
      '    command: ["api.yaml"]',
    );

    const migrated = migrateCompose(text, new Set(["gen"]));

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual(notKnown(4, [NAME]));
  });

  it("migrateYamlCommands keeps the string entrypoint of an unknown container", () => {
    const text = lines("services:", "  gen:", "    entrypoint: npx openapi-typescript api.yaml");

    const migrated = migrateCompose(text, new Set(["gen"]));

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual(notKnown(3, [NAME]));
  });

  it("migrateYamlCommands reports nothing for an unknown container that renames nothing", () => {
    const text = lines("services:", "  gen:", '    command: ["api.yaml", "-o", "out.ts"]');

    expect(migrateCompose(text, new Set(["gen"])).manualSteps).toEqual([]);
  });
});

describe("migrateYamlCommands and args that the image's program runs", () => {
  it.each([
    [
      "a Kubernetes container",
      [
        "containers:",
        "  - image: node:22",
        '    args: ["npx", "openapi-typescript", "a.yaml", "-it"]',
      ],
    ],
    [
      "a docker:// step",
      [
        "steps:",
        "  - uses: docker://node:22",
        "    with:",
        "      args: npx openapi-typescript a.yaml -it",
      ],
    ],
  ])("migrateYamlCommands reports the args alone of %s", (_, body) => {
    const text = lines(...body);

    const migrated = migrateYamlCommands(text, "a.yaml", valuesOf(text));

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      {
        kind: "container-not-known",
        location: `a.yaml:${body.length}`,
        unknown: "image-program",
        renames: [NAME, FLAG],
      },
    ]);
  });

  it("migrateYamlCommands reports no args alone that name no old program", () => {
    const text = lines("containers:", "  - image: gen", '    args: ["a.yaml", "-it"]');

    expect(migrateYamlCommands(text, "a.yaml", valuesOf(text)).manualSteps).toEqual([]);
  });
});

describe("containerServices", () => {
  it("containerServices names the services that set an entrypoint or a command", () => {
    const text = lines(
      "x-gen: &gen",
      '  entrypoint: ["npx"]',
      "services:",
      "  a: { <<: *gen }",
      "  b: { <<: [*gen] }",
      "  c: { command: x }",
      "  d: { image: node }",
      "other: { e: { command: x } }",
    );

    expect([...containerServices(valuesOf(text))]).toEqual(["a", "b", "c"]);
  });
});
