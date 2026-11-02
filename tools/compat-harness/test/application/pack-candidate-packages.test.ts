import { describe, expect, it } from "vitest";
import type { CommandRun } from "../../src/application/ports.ts";
import { packCandidatePackages } from "../../src/application/use-cases/pack-candidate-packages.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import { type FakeCommandEffect, FakeCommandRunner } from "../fakes/fake-command-runner.ts";
import { InMemoryFileStore } from "../fakes/in-memory-file-store.ts";
import { RecordingDirectoryEraser } from "../fakes/recording-directory-eraser.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";

const NAMES = [
  "openapi-typesafe",
  "openapi-typesafe-fetch",
  "openapi-typesafe-react-query",
  "openapi-typesafe-helpers",
];
const UNPACKED_MANIFEST = "packages/unpacked/package/package.json";

/** The manifest the fake `tar -x` unpacks for a tarball. */
function packedManifest(tarball: string): string {
  const name = NAMES.find((candidate) => tarball.endsWith(`/${candidate}-1.2.3.tgz`)) ?? "?";
  const dependencies =
    name === "openapi-typesafe-fetch" ? { "openapi-typesafe-helpers": "^1.2.3" } : {};
  return `${JSON.stringify({ name, dependencies })}\n`;
}

function setUp(script?: (run: CommandRun, work: InMemoryFileStore) => FakeCommandEffect) {
  const work = new InMemoryFileStore();
  const sources = new InMemoryFileStore(
    Object.fromEntries(NAMES.map((name) => [`${name}/package.json`, '{ "version": "1.2.3" }'])),
  );
  const repacked = new Map<string, string>();
  const runner = new FakeCommandRunner(work, (run) => {
    const [executable, flag, tarball = ""] = run.command;
    if (executable === "tar" && flag === "-xzf") {
      void work.writeText(UNPACKED_MANIFEST, packedManifest(tarball));
    }
    if (executable === "tar" && flag === "-czf") {
      repacked.set(tarball, work.files.get(UNPACKED_MANIFEST) ?? "");
    }
    return script?.(run, work) ?? {};
  });
  const dependencies = {
    runner,
    eraser: new RecordingDirectoryEraser(work),
    sources,
    work,
    logger: new RecordingLogger(),
  };
  return { dependencies, runner, sources, repacked };
}

describe("packCandidatePackages", () => {
  it("packCandidatePackages packs every package with pnpm and returns file specs", async () => {
    const { dependencies, runner } = setUp();

    const specs = await packCandidatePackages(dependencies, 5_000);

    expect(specs).toEqual(
      Object.fromEntries(NAMES.map((name) => [name, `file:/memory/packages/${name}-1.2.3.tgz`])),
    );
    const packs = runner.runs.filter((run) => run.command[1] === "pack");
    expect(packs.map((run) => run.cwd)).toEqual(NAMES.map((name) => `/memory/${name}`));
    expect(packs[0]?.command).toEqual(["pnpm", "pack", "--pack-destination", "/memory/packages"]);
    expect(dependencies.logger.records[0]?.event).toBe("candidate_packages_packed");
  });

  it("packCandidatePackages pins sibling dependencies inside the repacked tarballs", async () => {
    const { dependencies, repacked } = setUp();

    await packCandidatePackages(dependencies, 5_000);

    const fetchManifest = repacked.get("/memory/packages/openapi-typesafe-fetch-1.2.3.tgz") ?? "{}";
    expect(JSON.parse(fetchManifest).dependencies).toEqual({
      "openapi-typesafe-helpers": "file:/memory/packages/openapi-typesafe-helpers-1.2.3.tgz",
    });
    expect(repacked.size).toBe(NAMES.length);
  });

  it("packCandidatePackages stops with COMMAND_FAILED when packing fails", async () => {
    const { dependencies } = setUp((run) =>
      run.command[1] === "pack" ? { exitCode: 1, outputTail: "ERR_PNPM" } : {},
    );

    const pack = packCandidatePackages(dependencies, 5_000);

    await expect(pack).rejects.toMatchObject({ code: HarnessErrorCode.CommandFailed });
    await expect(pack).rejects.toThrow(/exited with 1.*\n.*ERR_PNPM/s);
  });

  it("packCandidatePackages reports a timed-out command as timed out", async () => {
    const { dependencies } = setUp((run) =>
      run.command[0] === "mkdir" ? { exitCode: null, isTimedOut: true } : {},
    );

    await expect(packCandidatePackages(dependencies, 5_000)).rejects.toThrow(/timed out/);
  });

  it("packCandidatePackages without a package version fails with STORED_FILE_INVALID", async () => {
    const { dependencies, sources } = setUp();
    sources.files.set("openapi-typesafe-helpers/package.json", "{}");

    await expect(packCandidatePackages(dependencies, 5_000)).rejects.toMatchObject({
      code: HarnessErrorCode.StoredFileInvalid,
    });
  });

  it("packCandidatePackages without a package manifest fails with STORED_FILE_INVALID", async () => {
    const { dependencies, sources } = setUp();
    sources.files.delete("openapi-typesafe/package.json");

    await expect(packCandidatePackages(dependencies, 5_000)).rejects.toThrow(/No version/);
  });

  it("packCandidatePackages fails when a tarball has no package.json", async () => {
    const { dependencies } = setUp((run, work) => {
      if (run.command[1] === "-xzf") {
        work.files.delete(UNPACKED_MANIFEST);
      }
      return {};
    });

    await expect(packCandidatePackages(dependencies, 5_000)).rejects.toThrow(/No package.json/);
  });
});
