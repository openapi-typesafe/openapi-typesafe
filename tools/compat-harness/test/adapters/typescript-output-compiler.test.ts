import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TypeScriptOutputCompiler } from "../../src/adapters/typescript-output-compiler.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import { useTemporaryDirectory } from "./temporary-directory.ts";

const createDirectory = useTemporaryDirectory();

/** A real TypeScript program per test; slow on a busy machine (see the identity checker tests). */
const COMPILER_TEST_TIMEOUT_MS = 30_000;

async function errorsOf(text: string): Promise<number> {
  const path = join(await createDirectory(), "output.ts");
  await writeFile(path, text);
  return new TypeScriptOutputCompiler().countErrors(path);
}

describe("TypeScriptOutputCompiler", { timeout: COMPILER_TEST_TIMEOUT_MS }, () => {
  it("countErrors of a file that compiles is 0", async () => {
    expect(await errorsOf("export interface A { id: string }\n")).toBe(0);
  });

  it("countErrors counts syntax and type errors", async () => {
    const text =
      "export type 400 = string;\nexport enum E { a = 'a' }\nexport enum E { a = 'a' }\n";

    expect(await errorsOf(text)).toBeGreaterThan(1);
  });

  it("countErrors with a missing file throws STORED_FILE_INVALID", async () => {
    const run = new TypeScriptOutputCompiler().countErrors("/no/such/output.ts");

    await expect(run).rejects.toMatchObject({ code: HarnessErrorCode.StoredFileInvalid });
  });
});
