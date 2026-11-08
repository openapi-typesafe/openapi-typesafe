import { describe, expect, it } from "vitest";
import { encodeJson } from "../../src/application/codecs.ts";
import { documentPath, SHARD_DESCRIPTOR_PATH } from "../../src/application/layout.ts";
import type { GeneratorRun } from "../../src/application/ports.ts";
import { checkOptInOutputs } from "../../src/application/use-cases/check-opt-in-outputs.ts";
import { compareOutputs } from "../../src/application/use-cases/compare-outputs.ts";
import { generateOutputs } from "../../src/application/use-cases/generate-outputs.ts";
import { mergeShardResults } from "../../src/application/use-cases/merge-shard-results.ts";
import type { CorpusShard } from "../../src/domain/corpus-shard.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import type { GeneratorOptionSet, OptInOptionSet } from "../../src/domain/option-matrix.ts";
import { makeEntry } from "../fakes/corpus-entries.ts";
import { type FakeGeneration, FakeGeneratorRunner } from "../fakes/fake-generator-runner.ts";
import { FakeOutputCompiler } from "../fakes/fake-output-compiler.ts";
import { InMemoryFileStore } from "../fakes/in-memory-file-store.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";

const shardsError = expect.objectContaining({ code: HarnessErrorCode.ShardsInvalid });
const ENTRIES = ["a", "b", "c", "d", "e", "f", "g"].map((name) => makeEntry({ name }));
const OPTION_SETS: GeneratorOptionSet[] = [
  { id: "default", flags: [] },
  { id: "enum", flags: ["--enum"] },
];
const OPT_IN: OptInOptionSet = { id: "blob", flags: ["--blob"], baselineOptionSetId: "default" };

/** Golden fails on "b"; the candidate differs on "c" with --enum; the opt-in flag changes "d". */
function scriptFor(label: string) {
  return (run: GeneratorRun): FakeGeneration => {
    const entry = ENTRIES.find((candidate) => run.schemaPath.includes(candidate.id));
    if (label === "golden" && entry?.id === ENTRIES[1]?.id) {
      return { kind: "fail", stderr: "Error: unsupported" };
    }
    const isChanged =
      (label === "candidate" && entry?.id === ENTRIES[2]?.id && run.flags.includes("--enum")) ||
      (entry?.id === ENTRIES[3]?.id && run.flags.includes("--blob"));
    return { kind: "output", text: `export type T = ${isChanged ? "string" : "number"};\n` };
  };
}

/** One full run in one cache: what scripts/run-compat.sh does before the report. */
async function runCompat(shard?: CorpusShard): Promise<InMemoryFileStore> {
  const cache = new InMemoryFileStore();
  for (const entry of ENTRIES) {
    cache.files.set(documentPath(entry), "{}");
  }
  const logger = new RecordingLogger();
  const generate = (label: string, optionSets: readonly GeneratorOptionSet[]) =>
    generateOutputs(
      { cache, runner: new FakeGeneratorRunner(cache, scriptFor(label)), logger },
      {
        label,
        entries: ENTRIES,
        ...(shard === undefined ? {} : { shard }),
        optionSets,
        concurrency: 2,
        timeoutMs: 1_000,
      },
    );
  await generate("golden", OPTION_SETS);
  await generate("candidate", OPTION_SETS);
  await generate("candidate-opt-in", [OPTION_SETS[0] as GeneratorOptionSet, OPT_IN]);
  const labels = { goldenLabel: "golden", candidateLabel: "candidate", concurrency: 2 };
  await compareOutputs({ cache, logger }, labels);
  await checkOptInOutputs(
    { cache, logger, outputCompiler: new FakeOutputCompiler() },
    { label: "candidate-opt-in", optionSets: [OPT_IN], concurrency: 2 },
  );
  return cache;
}

/** The results directories of shard runs, as the merge job downloads them. */
async function downloadShards(count: number, order = (index: number) => index) {
  const shards = new InMemoryFileStore();
  for (let index = 1; index <= count; index++) {
    const cache = await runCompat({ index, count });
    for (const [path, content] of cache.files) {
      if (path.startsWith("results/")) {
        shards.files.set(path.replace(/^results\//, `compat-shard-${order(index)}/`), content);
      }
    }
  }
  return shards;
}

function resultFiles(cache: InMemoryFileStore): Record<string, unknown> {
  const entries = [...cache.files].filter(([path]) => path.startsWith("results/"));
  return Object.fromEntries(entries.map(([path, content]) => [path, JSON.parse(content)]));
}

async function merge(shards: InMemoryFileStore, cache = new InMemoryFileStore()) {
  const logger = new RecordingLogger();
  const summary = await mergeShardResults({ shards, shardLister: shards, cache, logger });
  return { cache, logger, summary };
}

describe("mergeShardResults", () => {
  it.each([1, 2, 3, 10])(
    "mergeShardResults of %i shards writes the results of the unsharded run",
    async (count) => {
      const unsharded = await runCompat();
      const shards = await downloadShards(count);

      const { cache, summary } = await merge(shards);

      expect(resultFiles(cache)).toEqual(resultFiles(unsharded));
      expect(summary.shardCount).toBe(count);
    },
  );

  it("mergeShardResults reports the merged files and logs each one", async () => {
    const { logger, summary } = await merge(await downloadShards(2));

    expect(summary.files).toEqual([
      { name: "candidate-opt-in.generation.json", caseCount: 14 },
      { name: "candidate-opt-in.opt-in.json", caseCount: 7 },
      { name: "candidate.generation.json", caseCount: 14 },
      { name: "golden.generation.json", caseCount: 14 },
      { name: "golden__vs__candidate.comparison.json", caseCount: 14 },
    ]);
    expect(logger.records.filter((record) => record.event === "shard_results_merged")).toHaveLength(
      5,
    );
  });

  it("mergeShardResults orders shards by their descriptor, not by directory name", async () => {
    const unsharded = await runCompat();
    const shards = await downloadShards(3, (index) => 4 - index);

    const { cache } = await merge(shards);

    expect(resultFiles(cache)).toEqual(resultFiles(unsharded));
  });

  it("mergeShardResults removes a shard descriptor from the cache and keeps other files", async () => {
    const cache = new InMemoryFileStore({
      [SHARD_DESCRIPTOR_PATH]: encodeJson({ index: 1, count: 2 }),
      "results/dependents.json": "[]\n",
    });

    await merge(await downloadShards(2), cache);

    expect(cache.files.has(SHARD_DESCRIPTOR_PATH)).toBe(false);
    expect(cache.files.get("results/dependents.json")).toBe("[]\n");
  });

  it("mergeShardResults without shard directories throws SHARDS_INVALID", async () => {
    await expect(merge(new InMemoryFileStore())).rejects.toThrow(shardsError);
  });

  it("mergeShardResults with a missing shard throws SHARDS_INVALID", async () => {
    const shards = await downloadShards(3);
    for (const path of [...shards.files.keys()]) {
      if (path.startsWith("compat-shard-2/")) {
        shards.files.delete(path);
      }
    }

    await expect(merge(shards)).rejects.toThrow(
      /not shards 1 to N of one split: compat-shard-1=1\/3, compat-shard-3=3\/3/,
    );
  });

  it("mergeShardResults with shards of two splits throws SHARDS_INVALID", async () => {
    const shards = await downloadShards(2);
    shards.files.set("compat-shard-2/shard.json", encodeJson({ index: 2, count: 3 }));

    await expect(merge(shards)).rejects.toThrow(shardsError);
  });

  it("mergeShardResults with a directory without a descriptor throws SHARDS_INVALID", async () => {
    const shards = await downloadShards(2);
    shards.files.delete("compat-shard-1/shard.json");

    await expect(merge(shards)).rejects.toThrow(/Missing .*compat-shard-1\/shard.json/);
  });

  it("mergeShardResults with a file only some shards have throws SHARDS_INVALID", async () => {
    const shards = await downloadShards(2);
    shards.files.delete("compat-shard-2/candidate.generation.json");

    await expect(merge(shards)).rejects.toThrow(
      /Shard compat-shard-2 has no candidate.generation.json/,
    );
  });

  it("mergeShardResults with a file of another kind throws SHARDS_INVALID", async () => {
    const shards = await downloadShards(1);
    shards.files.set("compat-shard-1/dependents.json", "[]\n");

    await expect(merge(shards)).rejects.toThrow(/Cannot merge dependents.json/);
  });
});
