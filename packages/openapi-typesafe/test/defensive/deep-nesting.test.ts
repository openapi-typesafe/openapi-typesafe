import ts from "typescript";
import { describe, expect, it } from "vitest";
import { defaultRedoclyConfig } from "../../src/api/default-ports.js";
import { generateDeclarations } from "../../src/api/openapi-ts.js";
import { astToString } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { documentWith, generateCompiling, generationFailure, nestedObjects } from "./defensive-helpers.js";

/** Deeper than any real document (the YAML parser stops files at 100 levels). */
const DEEP_BUT_SUPPORTED = 300;
/** Far past the call stack of every step on the default Node.js stack size. */
const TOO_DEEP = 5_000;

/** Component schemas `M0` to `M<length - 1>`, each referring to the next through a property. */
function refChain(length: number): Record<string, unknown> {
  const next = (index: number) =>
    index + 1 < length ? { $ref: `#/components/schemas/M${index + 1}` } : { type: "string" };
  return Object.fromEntries(
    Array.from({ length }, (_, index) => [`M${index}`, { type: "object", properties: { next: next(index) } }]),
  );
}

describe("deep nesting", () => {
  it("a schema nested hundreds of levels deep generates and compiles", async () => {
    const output = await generateCompiling(documentWith({ Deep: nestedObjects(DEEP_BUT_SUPPORTED) }));

    expect(output.match(/next: /g)).toHaveLength(DEEP_BUT_SUPPORTED);
  });

  it("a schema nested past the call stack fails with SCHEMA_TOO_DEEP, not a RangeError", async () => {
    const error = await generationFailure(documentWith({ Deep: nestedObjects(TOO_DEEP) }));

    // Which step runs out first depends on the stack size of the platform and of the test worker.
    expect(error).toMatchObject({ code: "SCHEMA_TOO_DEEP" });
    expect(["load", "transform", "print"]).toContain(error.details.step);
    expect(error.message).toMatch(/nested too deeply to (load|transform|print)/);
    expect(error.cause).toBeInstanceOf(RangeError);
  });

  it("a schema that loads but is too deep to scan fails with SCHEMA_TOO_DEEP", async () => {
    const deep = documentWith({ Deep: nestedObjects(TOO_DEEP) });
    const ports = {
      loader: { load: async () => deep as never },
      logger: new RecordingLogger(),
      redoc: await defaultRedoclyConfig(),
      now: () => 0,
    };

    const generation = generateDeclarations(deep as never, { silent: true }, ports);

    await expect(generation).rejects.toMatchObject({
      code: "SCHEMA_TOO_DEEP",
      details: { step: "transform" },
    });
  });

  it("a chain of hundreds of $refs generates and compiles", async () => {
    await generateCompiling(documentWith(refChain(DEEP_BUT_SUPPORTED)));
  });

  it("a chain of $refs past the call stack fails with SCHEMA_TOO_DEEP", async () => {
    const error = await generationFailure(documentWith(refChain(TOO_DEEP)));

    expect(error).toMatchObject({ code: "SCHEMA_TOO_DEEP" });
    expect(["load", "transform", "print"]).toContain(error.details.step);
  });

  it("a deeply nested array schema fails with SCHEMA_TOO_DEEP", async () => {
    let schema: Record<string, unknown> = { type: "string" };
    for (let level = 0; level < TOO_DEEP; level++) {
      schema = { type: "array", items: schema };
    }

    expect(await generationFailure(documentWith({ Deep: schema }))).toMatchObject({
      code: "SCHEMA_TOO_DEEP",
    });
  });

  it("YAML deeper than the parser limit fails with SCHEMA_PARSE_FAILED and names the limit", async () => {
    const yaml = JSON.stringify(documentWith({ Deep: nestedObjects(DEEP_BUT_SUPPORTED) }));

    // A string that starts with "{" is JSON; a leading newline sends it to the YAML parser.
    const error = await generationFailure(`\n${yaml}`);

    expect(error).toMatchObject({ code: "SCHEMA_PARSE_FAILED", details: { format: "yaml" } });
    expect(error.message).toMatch(/nesting exceeded maxDepth \(100\)/);
  });

  it("printing TypeScript nodes nested past the call stack fails with SCHEMA_TOO_DEEP", () => {
    let type: ts.TypeNode = ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
    for (let level = 0; level < TOO_DEEP * 2; level++) {
      const member = ts.factory.createPropertySignature(undefined, "next", undefined, type);
      type = ts.factory.createTypeLiteralNode([member]);
    }

    expect(() => astToString(type)).toThrow(
      expect.objectContaining({ code: "SCHEMA_TOO_DEEP", details: { step: "print" } }),
    );
  });
});
