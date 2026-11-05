import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";

/** Paths that differ only in parameter names break the Paths Object rule and get a warning. */

function documentWith(paths: readonly string[]): string {
  const items = paths.map((path) => `  ${path}: { get: { responses: { "204": { description: none } } } }`);
  return `openapi: 3.1.0\ninfo: { title: t, version: "1" }\npaths:\n${items.join("\n")}\n`;
}

async function warningsOf(source: string): Promise<string[]> {
  const ports = await defaultGeneratorPorts({ silent: true });
  const logger = new RecordingLogger();
  await createDocumentRun(source, { silent: true }, { ...ports, logger });
  return logger.messages("warn");
}

describe("identical path template warnings", () => {
  it("createDocumentRun warns once per group, naming the paths, the rule and the code", async () => {
    const warnings = await warningsOf(documentWith(["/a/{id}", "/b", "/a/{name}", "/a/{key}"]));

    expect(warnings).toEqual([
      expect.stringMatching(
        /^Paths "\/a\/\{id\}", "\/a\/\{name\}" and "\/a\/\{key\}" differ only in their parameter names\. OpenAPI does not allow this \(Paths Object\): templated paths with the same hierarchy but different templated names MUST NOT exist as they are identical\. See .*#pathparamsastypes \(PATH_TEMPLATES_IDENTICAL\)$/,
      ),
    ]);
  });

  it("createDocumentRun names both paths of a pair", async () => {
    const warnings = await warningsOf(documentWith(["/a/{id}/b", "/a/{name}/b"]));

    expect(warnings[0]).toMatch(/^Paths "\/a\/\{id\}\/b" and "\/a\/\{name\}\/b" differ/);
  });

  it("createDocumentRun with distinct paths does not warn", async () => {
    expect(await warningsOf(documentWith(["/a/{id}", "/a/{id}/b", "/a/b"]))).toEqual([]);
  });
});
