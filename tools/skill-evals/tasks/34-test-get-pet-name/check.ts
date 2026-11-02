import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MUTANT_TIMEOUT_MS = 60_000;
/** getPetName with the failure check removed: tests that cover failures must catch it. */
const MUTANT = `
import type { Client } from "openapi-typesafe-fetch";
import type { paths } from "./api/schema";

export async function getPetName(client: Client<paths>, petId: number): Promise<string> {
  const { data } = await client.GET("/pets/{petId}", { params: { path: { petId } } });
  return data?.name ?? "";
}
`;
const copies: string[] = [];

afterAll(() => {
  for (const copy of copies) {
    rmSync(copy, { recursive: true, force: true });
  }
});

/** Run the project's own tests on a copy whose getPetName is broken; exit code 0 means not caught. */
function runTestsAgainstMutant(): number {
  const copy = mkdtempSync(join(tmpdir(), "skill-eval-mutant-"));
  copies.push(copy);
  cpSync(join(ROOT, "src"), join(copy, "src"), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(copy, "package.json"));
  symlinkSync(join(ROOT, "node_modules"), join(copy, "node_modules"));
  writeFileSync(join(copy, "src/pets.ts"), MUTANT);
  try {
    execFileSync(
      process.execPath,
      [join(ROOT, "node_modules/vitest/vitest.mjs"), "run", "src/pets.test.ts"],
      {
        cwd: copy,
        stdio: "pipe",
      },
    );
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? -1;
  }
}

test("src/pets.test.ts exists", () => {
  expect(existsSync(join(ROOT, "src/pets.test.ts"))).toBe(true);
});

test("the tests catch a getPetName that ignores failures", { timeout: MUTANT_TIMEOUT_MS }, () => {
  expect(runTestsAgainstMutant()).not.toBe(0);
});
