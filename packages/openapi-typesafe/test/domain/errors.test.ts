import { describe, expect, it } from "vitest";
import { TypeScriptNotFoundError } from "../../src/adapters/type-ast-bridge/load-typescript.js";
import { UnreadablePropertyError } from "../../src/api/schema-callbacks.js";
import { EmptyEnumNameError } from "../../src/application/transform/footer/enum-naming.js";
import { InvalidRefError } from "../../src/application/transform/ref-type.js";
import { InvalidPropertyError } from "../../src/application/transform/schema/object-type.js";
import { InvalidSchemaError } from "../../src/application/transform/schema/schema-transform.js";
import {
  ERROR_CODES,
  isOpenAPITypesafeError,
  OpenAPITypesafeError,
} from "../../src/domain/errors.js";

describe("OpenAPITypesafeError", () => {
  it("constructor keeps the code, the message, the details and the cause", () => {
    const cause = new Error("disk full");

    const error = new OpenAPITypesafeError({
      code: ERROR_CODES.OUTPUT_WRITE_FAILED,
      message: "Cannot write a.ts",
      details: { path: "a.ts" },
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code: "OUTPUT_WRITE_FAILED", message: "Cannot write a.ts" });
    expect(error.details).toEqual({ path: "a.ts" });
    expect(error.cause).toBe(cause);
  });

  it("constructor without details or cause gives empty details and no cause", () => {
    const error = new OpenAPITypesafeError({ code: ERROR_CODES.OUTPUT_STALE, message: "stale" });

    expect(error.details).toEqual({});
    expect("cause" in error).toBe(false);
  });
});

describe("isOpenAPITypesafeError", () => {
  it("isOpenAPITypesafeError with an instance returns true", () => {
    const error = new OpenAPITypesafeError({ code: ERROR_CODES.OUTPUT_STALE, message: "stale" });

    expect(isOpenAPITypesafeError(error)).toBe(true);
  });

  it("isOpenAPITypesafeError with the same shape from another copy of the class returns true", () => {
    const copy = Object.assign(new Error("stale"), { code: "OUTPUT_STALE", details: {} });

    expect(isOpenAPITypesafeError(copy)).toBe(true);
  });

  it("isOpenAPITypesafeError with an unknown code, a Node error or a non-error returns false", () => {
    const unknownCode = Object.assign(new Error("x"), { code: "ENOENT", details: {} });
    const withoutDetails = Object.assign(new Error("x"), { code: "OUTPUT_STALE" });

    expect(isOpenAPITypesafeError(unknownCode)).toBe(false);
    expect(isOpenAPITypesafeError(withoutDetails)).toBe(false);
    expect(isOpenAPITypesafeError({ code: "OUTPUT_STALE", details: {} })).toBe(false);
    expect(isOpenAPITypesafeError(null)).toBe(false);
  });
});

describe("typed error classes", () => {
  it.each([
    [new InvalidRefError("a.yaml"), "SCHEMA_REF_INVALID", { ref: "a.yaml" }],
    [new EmptyEnumNameError("-"), "ENUM_NAME_EMPTY", { name: "-" }],
    [
      new InvalidPropertyError("#/a", "b", []),
      "SCHEMA_PROPERTY_INVALID",
      { path: "#/a", property: "b", received: "Array" },
    ],
    [
      new InvalidSchemaError(1, "#/a"),
      "SCHEMA_OBJECT_INVALID",
      { path: "#/a", received: "number" },
    ],
    [
      new UnreadablePropertyError("#/a"),
      "CALLBACK_RESULT_UNREADABLE",
      { callback: "transformProperty", path: "#/a" },
    ],
    [
      new TypeScriptNotFoundError(),
      "TYPESCRIPT_NOT_FOUND",
      { packages: ["typescript", "@typescript/typescript6"] },
    ],
  ])("%s has its code and details", (error, code, details) => {
    expect(error).toBeInstanceOf(OpenAPITypesafeError);
    expect(error.code).toBe(code);
    expect(error.details).toEqual(details);
  });
});
