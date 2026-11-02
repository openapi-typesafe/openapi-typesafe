import { describe, expect, it } from "vitest";
import {
  comparisonResultsPath,
  dependentCheckoutPath,
  dependentRepositoryPath,
  documentPath,
  generationResultsPath,
  joinPath,
  outputPath,
  reportPaths,
} from "../../src/application/layout.ts";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import { makeEntry } from "../fakes/corpus-entries.ts";

describe("layout", () => {
  it.each([
    ["https://example.test/openapi.yaml", ".yaml"],
    ["https://example.test/OPENAPI.YML", ".yml"],
    ["https://example.test/openapi.json?raw=1", ".json"],
    ["https://example.test/v1-json", ".json"],
  ])("documentPath for %s uses the %s extension", (sourceUrl, extension) => {
    const entry = makeEntry({ name: "api", sourceUrl });

    expect(documentPath(entry)).toBe(`documents/${entry.id}${extension}`);
  });

  it("result and report paths are keyed by labels", () => {
    expect(outputPath("fork-base", "enum", "id" as CorpusEntryId)).toBe(
      "outputs/fork-base/enum/id.ts",
    );
    expect(generationResultsPath("current")).toBe("results/current.generation.json");
    expect(comparisonResultsPath("a", "b")).toBe("results/a__vs__b.comparison.json");
    expect(reportPaths("a", "b")).toEqual({
      markdown: "reports/a__vs__b.md",
      json: "reports/a__vs__b.json",
    });
  });
});

describe("dependents layout", () => {
  it("dependentRepositoryPath and dependentCheckoutPath are per project and variant", () => {
    expect(dependentRepositoryPath("demo")).toBe("repositories/demo");
    expect(dependentCheckoutPath("demo", "candidate")).toBe("checkouts/demo/candidate");
  });

  it.each([
    [["checkouts/demo", ".", "gen/a.ts"], "checkouts/demo/gen/a.ts"],
    [["/abs/root/", "./app", "x"], "/abs/root/app/x"],
    [["a//b", "c/"], "a/b/c"],
  ])("joinPath(%j) is %s", (segments, joined) => {
    expect(joinPath(...segments)).toBe(joined);
  });
});
