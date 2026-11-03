import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TypeScriptIdentityChecker } from "../../src/adapters/typescript-identity-checker.ts";
import type { TypeDifferences } from "../../src/application/ports.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import { useTemporaryDirectory } from "./temporary-directory.ts";

const createDirectory = useTemporaryDirectory();

/**
 * Each test builds a real TypeScript program with the default lib. Alone the first one takes about
 * 2 s; while other suites (or a compat run) use the CPU it took more than vitest's 5 s default. The
 * tests check which types differ, not how fast, so they allow 30 s.
 */
const COMPILER_TEST_TIMEOUT_MS = 30_000;

async function findTypeDifferences(golden: string, candidate: string): Promise<TypeDifferences> {
  const directory = await createDirectory();
  const goldenPath = join(directory, "golden.ts");
  const candidatePath = join(directory, "candidate.ts");
  await writeFile(goldenPath, golden);
  await writeFile(candidatePath, candidate);
  return new TypeScriptIdentityChecker().findDifferentTypes(goldenPath, candidatePath);
}

/** Every name that is not identical, changed or added, as the older tests expect. */
async function findDifferences(golden: string, candidate: string): Promise<readonly string[]> {
  const { changed, added } = await findTypeDifferences(golden, candidate);
  return [...changed, ...added].sort();
}

describe("TypeScriptIdentityChecker", { timeout: COMPILER_TEST_TIMEOUT_MS }, () => {
  it("findDifferentTypes treats structurally identical declarations as identical", async () => {
    const golden =
      "export interface paths { '/a': { get: components['schemas']['A'] } }\n" +
      "export interface components { schemas: { A: { id: string; tags?: string[] } } }";
    const candidate =
      "export type components = { schemas: { A: { tags?: string[]; id: string } } };\n" +
      "export interface paths { '/a': { get: components['schemas']['A'] } }";

    expect(await findDifferences(golden, candidate)).toEqual([]);
  });

  it("findDifferentTypes catches readonly and any, which mutual assignability misses", async () => {
    const golden = "export interface A { id: string }\nexport type B = { value: string };";
    const candidate = "export interface A { readonly id: string }\nexport type B = { value: any };";

    expect(await findDifferences(golden, candidate)).toEqual(["A", "B"]);
  });

  it("findDifferentTypes reports names exported by only one file", async () => {
    const golden = "export type Kept = string;\nexport type Removed = number;";
    const candidate = "export type Kept = string;\nexport type Added = boolean;";

    expect(await findDifferences(golden, candidate)).toEqual(["Added", "Removed"]);
  });

  it("findDifferentTypes tells changed golden names from names only the candidate adds", async () => {
    const golden = "export type Kept = string;\nexport type Changed = number;";
    const candidate =
      "export type Kept = string;\nexport type Changed = string;\nexport type Kept_2 = string;";

    expect(await findTypeDifferences(golden, candidate)).toEqual({
      changed: ["Changed"],
      added: ["Kept_2"],
    });
  });

  it("findDifferentTypes compares enums and generic types by declaration text", async () => {
    const golden =
      "export enum Color { Red = 'red' }\nexport type Box<T> = { value: T };\n" +
      "export enum Size { S = 's' }";
    const candidate =
      "export enum Color {\n  Red = 'red',\n}\nexport type Box<T> = { value: T[] };\n" +
      "export enum Size { M = 'm' }";

    expect(await findDifferences(golden, candidate)).toEqual(["Box", "Size"]);
  });

  it("findDifferentTypes reports a name that is generic in only one file", async () => {
    const golden = "export type Box<T> = { value: T };";
    const candidate = "export type Box = { value: unknown };";

    expect(await findDifferences(golden, candidate)).toEqual(["Box"]);
  });

  it("findDifferentTypes ignores errors inside the generated files and skips non-type exports", async () => {
    const golden = "export type A = Missing;\nexport const value = 1;\ntype Local = string;";
    const candidate = "export type A = Missing;\nexport const value = 2;";

    expect(await findDifferences(golden, candidate)).toEqual([]);
  });

  it("findDifferentTypes with a missing file throws STORED_FILE_INVALID", async () => {
    const directory = await createDirectory();

    const run = new TypeScriptIdentityChecker().findDifferentTypes(
      join(directory, "a.ts"),
      join(directory, "b.ts"),
    );

    await expect(run).rejects.toMatchObject({ code: HarnessErrorCode.StoredFileInvalid });
  });
});
