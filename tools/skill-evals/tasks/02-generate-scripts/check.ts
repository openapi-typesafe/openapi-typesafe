import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCHEMA = `${ROOT}src/api/schema.d.ts`;
const ORIGINAL = readFileSync(SCHEMA, "utf8");
const SCRIPT_TIMEOUT_MS = 60_000;

function runScript(name: string): number {
  try {
    execFileSync("npm", ["run", "--silent", name], { cwd: ROOT, stdio: "pipe" });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? -1;
  }
}

afterEach(() => writeFileSync(SCHEMA, ORIGINAL));

test("check:api passes when the types are current", { timeout: SCRIPT_TIMEOUT_MS }, () => {
  expect(runScript("check:api")).toBe(0);
});

test("check:api fails when the types are stale", { timeout: SCRIPT_TIMEOUT_MS }, () => {
  writeFileSync(SCHEMA, `${ORIGINAL}\nexport type Stale = true;\n`);

  expect(runScript("check:api")).not.toBe(0);
});

test("generate:api writes the generated types", { timeout: SCRIPT_TIMEOUT_MS }, () => {
  writeFileSync(SCHEMA, "");

  expect(runScript("generate:api")).toBe(0);
  expect(readFileSync(SCHEMA, "utf8")).toBe(ORIGINAL);
});
