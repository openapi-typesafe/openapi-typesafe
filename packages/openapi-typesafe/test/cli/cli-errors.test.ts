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

  it("describeCliFailure with SCHEMA_INVALID counts the problems printed before", () => {
    expect(failureFor("SCHEMA_INVALID", { problems: ["a", "b"] }).message).toBe(
      "The OpenAPI document has 2 errors (see above) (SCHEMA_INVALID)",
    );
    expect(failureFor("SCHEMA_INVALID", { problems: ["a"] }).message).toBe(
      "The OpenAPI document has 1 error (see above) (SCHEMA_INVALID)",
    );
    expect(failureFor("SCHEMA_INVALID").message).toContain("has 1 error");
  });

  it("describeCliFailure with an untyped error returns INTERNAL with the stack", () => {
    const failure = describeCliFailure(new TypeError("boom"));

    expect(failure.exitCode).toBe(EXIT_CODES.INTERNAL);
    expect(failure.message).toMatch(/^Unexpected error: TypeError: boom\n/);
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
