import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { composeIncludes, serviceValues } from "../../src/domain/compose-includes.js";
import { type DocumentValue, usedDocumentValues } from "../../src/domain/config-documents.js";
import { COMPOSE_FILE, DEFAULT_YAML_FILE } from "../../src/domain/yaml-environments.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function valuesOf(text: string): DocumentValue[] {
  const read = yaml.read(text);
  return read.kind === "read" ? usedDocumentValues(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const GEN = [
  "services:",
  "  gen:",
  '    entrypoint: ["npx", "openapi-typescript"]',
  '    command: ["api.yaml", "-it"]',
];

describe("composeIncludes", () => {
  it("composeIncludes reads the short form and the path of the long form, one or a list", () => {
    const text = lines(
      "include:",
      "  - a.yaml",
      "  - path: b.yaml",
      "    project_directory: c",
      "    env_file: d.env",
      "  - path: [e.yaml, f.yaml]",
      "other: [g.yaml]",
    );

    const entries = composeIncludes(valuesOf(text)).map((entry) => entry.map(({ value }) => value));

    expect(entries).toEqual([["a.yaml"], ["b.yaml"], ["e.yaml", "f.yaml"]]);
  });

  it("composeIncludes reads no include that is a map, which Compose rejects", () => {
    expect(composeIncludes(valuesOf(lines("include: { path: a.yaml }")))).toEqual([]);
  });

  it("composeIncludes reads no include key below the top level", () => {
    expect(composeIncludes(valuesOf(lines("x:", "  include: [a.yaml]")))).toEqual([]);
  });
});

describe("serviceValues", () => {
  it("serviceValues names each service once, with the first value it holds", () => {
    const text = lines("services:", "  a: { image: x, command: y }", "  b: {}", "other: { c: 1 }");

    const found = [...serviceValues(valuesOf(text))].map(([name, { start }]) => [name, start]);

    expect(found).toEqual([
      ["a", text.indexOf("x")],
      ["b", text.indexOf("{}")],
    ]);
  });
});

describe("migrateYamlCommands and Compose includes", () => {
  const migrate = (text: string, reading: object) =>
    migrateYamlCommands(text, "compose.yaml", valuesOf(text), { ...COMPOSE_FILE, ...reading });

  it("migrateYamlCommands reports an include that the project did not read", () => {
    const text = lines("include:", "  - a.yaml", "  - path: [b.yaml, c.yaml]");
    const unreadIncludes = new Map([
      ["a.yaml", "not-in-project"],
      ["c.yaml", "cycle"],
    ]);

    expect(migrate(text, { unreadIncludes }).manualSteps).toEqual([
      {
        kind: "compose-include-not-read",
        location: "compose.yaml:2",
        path: "a.yaml",
        problem: "not-in-project",
      },
      {
        kind: "compose-include-not-read",
        location: "compose.yaml:3",
        path: "c.yaml",
        problem: "cycle",
      },
    ]);
  });

  it("migrateYamlCommands reports and keeps a service that an included file defines too", () => {
    const text = lines(...GEN);

    const migrated = migrate(text, { includedServices: new Set(["gen", "other"]) });

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps.map((step) => step.kind)).toEqual([
      "compose-service-conflict",
      "container-not-known",
    ]);
    expect(migrated.manualSteps[0]).toEqual({
      kind: "compose-service-conflict",
      location: "compose.yaml:3",
      service: "gen",
    });
  });

  it("migrateYamlCommands reads no includes in a file that is no Compose file", () => {
    const text = lines("include: [a.yaml]", ...GEN);
    const reading = {
      ...DEFAULT_YAML_FILE,
      unreadIncludes: new Map([["a.yaml", "cycle" as const]]),
      includedServices: new Set(["gen"]),
    };

    const migrated = migrateYamlCommands(text, "ci.yml", valuesOf(text), reading);

    expect(migrated.manualSteps).toEqual([]);
  });
});
