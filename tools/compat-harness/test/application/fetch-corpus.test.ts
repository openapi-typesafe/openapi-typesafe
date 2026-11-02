import { describe, expect, it } from "vitest";
import { decodeManifest } from "../../src/application/codecs.ts";
import { documentPath, REPOSITORY_PATHS } from "../../src/application/layout.ts";
import { FetchStatus, fetchCorpus } from "../../src/application/use-cases/fetch-corpus.ts";
import type { CorpusEntry } from "../../src/domain/corpus-entry.ts";
import { createManifest } from "../../src/domain/manifest.ts";
import { makeEntry } from "../fakes/corpus-entries.ts";
import { FakeHasher } from "../fakes/fake-hasher.ts";
import { FakeHttpClient, type ScriptedReply } from "../fakes/fake-http-client.ts";
import { InMemoryFileStore } from "../fakes/in-memory-file-store.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";

const hasher = new FakeHasher();
const RETRY = { attempts: 3, initialDelayMs: 50 };

function setUp(entries: CorpusEntry[], replies: Record<string, ScriptedReply | ScriptedReply[]>) {
  const cache = new InMemoryFileStore();
  const repository = new InMemoryFileStore();
  const delays: number[] = [];
  const dependencies = {
    http: new FakeHttpClient(replies),
    repository,
    cache,
    hasher,
    logger: new RecordingLogger(),
    sleep: async (milliseconds: number) => void delays.push(milliseconds),
  };
  const run = (isHashUpdateAllowed = false) =>
    fetchCorpus(dependencies, createManifest(entries), {
      entries,
      concurrency: 2,
      retry: RETRY,
      isHashUpdateAllowed,
    });
  return { cache, repository, delays, dependencies, run };
}

describe("fetchCorpus", () => {
  it("fetchCorpus downloads a new entry, caches it and records its hash", async () => {
    const entry = makeEntry({ name: "new" });
    const { cache, repository, run } = setUp([entry], {
      [entry.sourceUrl]: { status: 200, body: "spec" },
    });

    const { manifest, outcomes } = await run();

    expect(outcomes).toEqual([{ entryId: entry.id, status: FetchStatus.Downloaded, detail: "" }]);
    expect(cache.files.get(documentPath(entry))).toBe("spec");
    expect(manifest.entries[0]?.sha256).toBe(hasher.sha256("spec"));
    const written = decodeManifest(repository.files.get(REPOSITORY_PATHS.manifest) ?? "");
    expect(written.entries[0]?.sha256).toBe(hasher.sha256("spec"));
  });

  it("fetchCorpus skips the download when the cached copy matches the hash", async () => {
    const entry = makeEntry({ name: "cached", sha256: hasher.sha256("spec") });
    const { cache, dependencies, run } = setUp([entry], {});
    await cache.writeText(documentPath(entry), "spec");

    const { outcomes } = await run();

    expect(outcomes[0]?.status).toBe(FetchStatus.Cached);
    expect(dependencies.http.requests).toEqual([]);
  });

  it("fetchCorpus retries network errors and server errors with backoff", async () => {
    const entry = makeEntry({ name: "flaky" });
    const replies = [
      new Error("ECONNRESET"),
      { status: 503, body: "" },
      { status: 200, body: "spec" },
    ];
    const { delays, run } = setUp([entry], { [entry.sourceUrl]: replies });

    const { outcomes } = await run();

    expect(outcomes[0]?.status).toBe(FetchStatus.Downloaded);
    expect(delays).toEqual([50, 100]);
  });

  it("fetchCorpus reports a failure after the last attempt", async () => {
    const entry = makeEntry({ name: "down" });
    const { run } = setUp([entry], { [entry.sourceUrl]: { status: 429, body: "" } });

    const { outcomes } = await run();

    expect(outcomes[0]).toMatchObject({ status: FetchStatus.Failed, detail: "HTTP 429" });
  });

  it("fetchCorpus does not retry a 404 and reports it as failed", async () => {
    const entry = makeEntry({ name: "gone" });
    const { dependencies, run } = setUp([entry], {});

    const { outcomes } = await run();

    expect(outcomes[0]).toMatchObject({ status: FetchStatus.Failed, detail: "HTTP 404" });
    expect(dependencies.http.requests).toHaveLength(1);
    expect(dependencies.logger.records[0]?.level).toBe("warn");
  });

  it("fetchCorpus reports a changed document as a mismatch and keeps the cache", async () => {
    const entry = makeEntry({ name: "changed", sha256: hasher.sha256("old") });
    const { cache, run } = setUp([entry], { [entry.sourceUrl]: { status: 200, body: "new" } });

    const { manifest, outcomes } = await run();

    expect(outcomes[0]?.status).toBe(FetchStatus.HashMismatch);
    expect(cache.files.has(documentPath(entry))).toBe(false);
    expect(manifest.entries[0]?.sha256).toBe(hasher.sha256("old"));
  });

  it("fetchCorpus with hash updates allowed replaces a changed hash", async () => {
    const entry = makeEntry({ name: "changed", sha256: hasher.sha256("old") });
    const { run } = setUp([entry], { [entry.sourceUrl]: { status: 200, body: "new" } });

    const { manifest, outcomes } = await run(true);

    expect(outcomes[0]?.status).toBe(FetchStatus.Downloaded);
    expect(manifest.entries[0]?.sha256).toBe(hasher.sha256("new"));
  });
});
