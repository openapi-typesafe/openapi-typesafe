import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { generateTypes } from "../scripts/generate";

const GENERATION_TIMEOUT_MS = 30_000;

test("generateTypes returns the types with root aliases", {
  timeout: GENERATION_TIMEOUT_MS,
}, async () => {
  const document = readFileSync(new URL("../openapi.yaml", import.meta.url), "utf8");

  const output = await generateTypes(document);

  expect(output).toContain("export interface paths");
  expect(output).toMatch(/export type SchemaPet = components\[['"]schemas['"]\]\[['"]Pet['"]\];/);
});
