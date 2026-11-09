import { describe, expect, it } from "vitest";
import { cliError, describeCliFailure, EXIT_CODES } from "../../src/cli/cli-errors.js";
import { ERROR_CODES, type ErrorCode, OpenAPITypesafeError } from "../../src/domain/errors.js";

function failureFor(code: ErrorCode, details = {}) {
  return describeCliFailure(new OpenAPITypesafeError({ code, message: "Message", details }));
}

describe("describeCliFailure", () => {
  it.each([
    ["SCHEMA_LOAD_FAILED", EXIT_CODES.SCHEMA],
    ["SCHEMA_VERSION_UNSUPPORTED", EXIT_CODES.SCHEMA],
    ["ENUM_NAME_EMPTY", EXIT_CODES.SCHEMA],
    ["CLI_FLAG_REMOVED", EXIT_CODES.USAGE],
    ["TYPESCRIPT_NOT_FOUND", EXIT_CODES.USAGE],
    ["OUTPUT_STALE", EXIT_CODES.OUTPUT_STALE],
    ["OUTPUT_WRITE_FAILED", EXIT_CODES.OUTPUT],
  ] as const)("describeCliFailure with %s returns exit code %i", (code, exitCode) => {
    expect(failureFor(code)).toEqual({ exitCode, message: `Message (${code})` });
  });

  it("describeCliFailure maps every error code to a documented exit code", () => {
    const documented = new Set<number>(Object.values(EXIT_CODES));

    for (const code of Object.values(ERROR_CODES)) {
      expect(documented.has(failureFor(code).exitCode)).toBe(true);
    }
  });

  it("describeCliFailure with stdin that holds only a YAML string gives CLI advice (G14)", () => {
    const failure = failureFor("SCHEMA_SOURCE_INVALID", { reason: "path", received: "stream", text: "hello" });

    expect(failure.message).toBe(
      'stdin held only the YAML string "hello", not an OpenAPI document. To read a file, pass its path ' +
        "or URL as the first argument: openapi-typesafe ./openapi.yaml -o ./schema.ts (SCHEMA_SOURCE_INVALID)",
    );
  });

  it("describeCliFailure with any other SCHEMA_SOURCE_INVALID keeps its message", () => {
    expect(failureFor("SCHEMA_SOURCE_INVALID", { received: "number" }).message).toBe("Message (SCHEMA_SOURCE_INVALID)");
  });

  it("describeCliFailure with SCHEMA_INVALID counts the problems printed before", () => {
    expect(failureFor("SCHEMA_INVALID", { problems: ["a", "b"] }).message).toBe(
      "The OpenAPI document has 2 errors (see above) (SCHEMA_INVALID)",
    );
    expect(failureFor("SCHEMA_INVALID", { problems: ["a"] }).message).toBe(
      "The OpenAPI document has 1 error (see above) (SCHEMA_INVALID)",
    );
    expect(failureFor("SCHEMA_INVALID").message).toContain("has 1 error");
  });

  it("describeCliFailure with a failed fetch names the source and the network reason", () => {
    const reason = new Error("connect ECONNREFUSED 127.0.0.1:9");
    const error = new OpenAPITypesafeError({
      code: "SCHEMA_LOAD_FAILED",
      message: "fetch failed",
      details: { source: "http://127.0.0.1:9/a.yaml" },
      cause: new TypeError("fetch failed", { cause: reason }),
    });

    expect(describeCliFailure(error).message).toBe(
      "fetch failed: connect ECONNREFUSED 127.0.0.1:9 (http://127.0.0.1:9/a.yaml) " + "(SCHEMA_LOAD_FAILED)",
    );
  });

  it("describeCliFailure with a load failure without a nested reason keeps the message", () => {
    const error = new OpenAPITypesafeError({
      code: "SCHEMA_LOAD_FAILED",
      message: "ENOENT: no such file or directory 'a.yaml'",
      details: { source: "file:///a.yaml" },
      cause: new Error("ENOENT: no such file or directory 'a.yaml'"),
    });

    expect(describeCliFailure(error).message).toBe("ENOENT: no such file or directory 'a.yaml' (SCHEMA_LOAD_FAILED)");
  });

  it("describeCliFailure with the YAML nesting limit says how to fix the document", () => {
    const message = failureFor("SCHEMA_PARSE_FAILED").message;
    const deep = describeCliFailure(
      new OpenAPITypesafeError({
        code: "SCHEMA_PARSE_FAILED",
        message: 'nesting exceeded maxDepth (100) in "a.yaml" (1:1974)',
      }),
    ).message;

    expect(message).toBe("Message (SCHEMA_PARSE_FAILED)");
    expect(deep).toBe(
      'nesting exceeded maxDepth (100) in "a.yaml" (1:1974). The YAML parser reads at most 100 ' +
        "nested levels: move nested schemas to `components` and reference them with `$ref` " +
        "(SCHEMA_PARSE_FAILED)",
    );
  });

  it("describeCliFailure with an untyped error returns INTERNAL with the stack", () => {
    const failure = describeCliFailure(new TypeError("boom"));

    expect(failure.exitCode).toBe(EXIT_CODES.INTERNAL);
    expect(failure.message).toMatch(/^Unexpected error: TypeError: boom\n/);
  });

  it("describeCliFailure with an untyped error without a stack returns INTERNAL with its message", () => {
    const error = new TypeError("boom");
    delete error.stack;

    expect(describeCliFailure(error)).toEqual({
      exitCode: EXIT_CODES.INTERNAL,
      message: "Unexpected error: boom",
    });
  });

  it("describeCliFailure with a thrown non-error returns INTERNAL with its text", () => {
    expect(describeCliFailure("boom")).toEqual({
      exitCode: EXIT_CODES.INTERNAL,
      message: "Unexpected error: boom",
    });
  });
});

describe("cliError", () => {
  it("cliError creates a typed error with the code, the message and the cause", () => {
    const cause = new Error("EACCES");

    const error = cliError("OUTPUT_WRITE_FAILED", "Cannot write a.ts", cause);

    expect(error).toMatchObject({ code: "OUTPUT_WRITE_FAILED", message: "Cannot write a.ts" });
    expect(error.cause).toBe(cause);
  });
});
