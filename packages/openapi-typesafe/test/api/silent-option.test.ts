import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

/**
 * `silent: true` keeps the Node API off the terminal: no warning and no problem line of a document
 * that fails, whose error lists the problems instead (#43). The built package runs in a child
 * process, so its real stderr is what is checked.
 */

const PACKAGE_ENTRY = new URL("../../dist/index.mjs", import.meta.url).href;

const BROKEN_REF = [
  "openapi: 3.1.0",
  'info: { title: t, version: "1" }',
  "paths: {}",
  'components: { schemas: { T: { $ref: "./missing.yaml#/X" } } }',
].join("\n");

async function runWith(options: string) {
  const script = [
    `const { default: openapiTS } = await import(${JSON.stringify(PACKAGE_ENTRY)});`,
    `try { await openapiTS(${JSON.stringify(BROKEN_REF)}, ${options}); }`,
    "catch (error) { console.log(error.code, error.details.problems.length); }",
  ].join("\n");
  const cwd = fileURLToPath(new URL(".", import.meta.url));
  return execa("node", ["--input-type=module", "-e", script], { cwd });
}

describe("openapiTS: the silent option", () => {
  it("openapiTS with silent: true prints no problem line and still rejects with every problem", async () => {
    const { stdout, stderr } = await runWith("{ silent: true }");

    expect(stderr).toBe("");
    expect(stdout).toBe("SCHEMA_INVALID 1");
  });

  it("openapiTS without silent prints the problem line to stderr", async () => {
    const { stderr } = await runWith("{}");

    expect(stderr).toContain("Can't resolve $ref");
  });
});
