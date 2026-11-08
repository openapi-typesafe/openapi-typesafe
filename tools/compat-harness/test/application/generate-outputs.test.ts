import { describe, expect, it } from "vitest";
import { decodeGenerationResults, decodeShardDescriptor } from "../../src/application/codecs.ts";
import {
  documentPath,
  generationResultsPath,
  outputPath,
  SHARD_DESCRIPTOR_PATH,
} from "../../src/application/layout.ts";
import { generateOutputs } from "../../src/application/use-cases/generate-outputs.ts";
import { selectOptionSets } from "../../src/domain/option-matrix.ts";
import { GenerationStatus } from "../../src/domain/run-result.ts";
import { makeEntry } from "../fakes/corpus-entries.ts";
import { type FakeGeneration, FakeGeneratorRunner } from "../fakes/fake-generator-runner.ts";
import { InMemoryFileStore } from "../fakes/in-memory-file-store.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";

const ok = makeEntry({ name: "ok" });
const broken = makeEntry({ name: "broken" });
const slow = makeEntry({ name: "slow" });
const missing = makeEntry({ name: "missing" });
const LONG_STDERR = ["Error: bad $ref", "line 2", "line 3", "line 4", "line 5", "line 6"].join(
  "\n",
);

function script(run: { schemaPath: string; flags: readonly string[] }): FakeGeneration {
  if (run.schemaPath.includes(broken.id)) {
    return { kind: "fail", stderr: LONG_STDERR };
  }
  if (run.schemaPath.includes(slow.id)) {
    return { kind: "timeout" };
  }
  return { kind: "output", text: `export interface paths {} // ${run.flags.join(" ")}` };
}

function setUp() {
  const cache = new InMemoryFileStore();
  for (const entry of [ok, broken, slow]) {
    cache.files.set(documentPath(entry), "{}");
  }
  const runner = new FakeGeneratorRunner(cache, script);
  const dependencies = { cache, runner, logger: new RecordingLogger() };
  const options = {
    label: "golden",
    entries: [ok, broken, slow, missing],
    optionSets: selectOptionSets(["default", "enum"]),
    concurrency: 3,
    timeoutMs: 1_000,
  };
  return { cache, runner, dependencies, options };
}

describe("generateOutputs", () => {
  it("generateOutputs runs every entry with every option set and maps outcomes to statuses", async () => {
    const { dependencies, options } = setUp();

    const results = await generateOutputs(dependencies, options);

    expect(results.map((result) => [result.optionSetId, result.entryId, result.status])).toEqual([
      ["default", ok.id, GenerationStatus.Ok],
      ["default", broken.id, GenerationStatus.Failed],
      ["default", slow.id, GenerationStatus.TimedOut],
      ["default", missing.id, GenerationStatus.Failed],
      ["enum", ok.id, GenerationStatus.Ok],
      ["enum", broken.id, GenerationStatus.Failed],
      ["enum", slow.id, GenerationStatus.TimedOut],
      ["enum", missing.id, GenerationStatus.Failed],
    ]);
  });

  it("generateOutputs stores outputs per option set and passes the flags", async () => {
    const { cache, runner, dependencies, options } = setUp();

    await generateOutputs(dependencies, options);

    expect(cache.files.get(outputPath("golden", "enum", ok.id))).toBe(
      "export interface paths {} // --enum",
    );
    expect(runner.runs.find((run) => run.flags.length > 0)?.timeoutMs).toBe(1_000);
  });

  it("generateOutputs keeps the first five stderr lines and explains missing documents", async () => {
    const { dependencies, options } = setUp();

    const results = await generateOutputs(dependencies, options);

    expect(results[1]?.errorExcerpt).toBe(LONG_STDERR.split("\n").slice(0, 5).join("\n"));
    expect(results[3]?.errorExcerpt).toMatch(/run the fetch command first/);
  });

  it("generateOutputs removes a stale output so a failed run is not reported as ok", async () => {
    const { cache, dependencies, options } = setUp();
    cache.files.set(outputPath("golden", "default", broken.id), "stale");

    await generateOutputs(dependencies, { ...options, entries: [broken] });

    expect(cache.files.has(outputPath("golden", "default", broken.id))).toBe(false);
  });

  it("generateOutputs writes the results file and logs failures as warnings", async () => {
    const { cache, dependencies, options } = setUp();

    const results = await generateOutputs(dependencies, options);

    expect(decodeGenerationResults(cache.files.get(generationResultsPath("golden")) ?? "")).toEqual(
      results,
    );
    const levels = dependencies.logger.records.map((record) => record.level);
    expect(levels.filter((level) => level === "warn")).toHaveLength(6);
  });

  it("generateOutputs with a shard runs only that shard's entries and records the shard", async () => {
    const { cache, dependencies, options } = setUp();

    const results = await generateOutputs(dependencies, {
      ...options,
      shard: { index: 2, count: 3 },
    });

    expect(results.map((result) => [result.optionSetId, result.entryId])).toEqual([
      ["default", broken.id],
      ["enum", broken.id],
    ]);
    expect(decodeShardDescriptor(cache.files.get(SHARD_DESCRIPTOR_PATH) ?? "")).toEqual({
      index: 2,
      count: 3,
    });
  });

  it("generateOutputs without a shard removes a shard descriptor of an earlier run", async () => {
    const { cache, dependencies, options } = setUp();
    cache.files.set(SHARD_DESCRIPTOR_PATH, '{"index":1,"count":2}');

    await generateOutputs(dependencies, options);

    expect(cache.files.has(SHARD_DESCRIPTOR_PATH)).toBe(false);
  });
});
