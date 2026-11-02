import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

/** Create a fresh directory per test and delete it after the test. */
export function useTemporaryDirectory(): () => Promise<string> {
  const created: string[] = [];
  afterEach(async () => {
    await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });
  return async () => {
    const path = await mkdtemp(join(tmpdir(), "compat-harness-"));
    created.push(path);
    return path;
  };
}
