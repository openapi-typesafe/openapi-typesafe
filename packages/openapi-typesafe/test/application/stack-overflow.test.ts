import { describe, expect, it } from "vitest";
import {
  isStackOverflowError,
  schemaTooDeepError,
  withStackOverflowReported,
  withStackOverflowReportedAsync,
} from "../../src/application/stack-overflow.js";

const OVERFLOW = new RangeError("Maximum call stack size exceeded");

describe("stack overflow", () => {
  it("isStackOverflowError accepts only a RangeError about the call stack", () => {
    expect(isStackOverflowError(OVERFLOW)).toBe(true);
    expect(isStackOverflowError(new RangeError("Invalid array length"))).toBe(false);
    expect(isStackOverflowError(new Error("Maximum call stack size exceeded"))).toBe(false);
    expect(isStackOverflowError("Maximum call stack size exceeded")).toBe(false);
  });

  it("schemaTooDeepError names the step and keeps the cause", () => {
    const error = schemaTooDeepError("transform", OVERFLOW);

    expect(error).toMatchObject({ code: "SCHEMA_TOO_DEEP", details: { step: "transform" } });
    expect(error.message).toMatch(/^The schema is nested too deeply to transform/);
    expect(error.cause).toBe(OVERFLOW);
  });

  it("withStackOverflowReported returns the result and reports an overflow", () => {
    expect(withStackOverflowReported("print", () => 1)).toBe(1);
    expect(() =>
      withStackOverflowReported("print", () => {
        throw OVERFLOW;
      }),
    ).toThrow(expect.objectContaining({ code: "SCHEMA_TOO_DEEP", details: { step: "print" } }));
  });

  it("withStackOverflowReported lets other errors through unchanged", () => {
    const other = new TypeError("other");

    expect(() =>
      withStackOverflowReported("print", () => {
        throw other;
      }),
    ).toThrow(other);
  });

  it("withStackOverflowReportedAsync reports an overflow and lets other errors through", async () => {
    const other = new Error("other");

    await expect(withStackOverflowReportedAsync("load", async () => 2)).resolves.toBe(2);
    await expect(
      withStackOverflowReportedAsync("load", () => Promise.reject(OVERFLOW)),
    ).rejects.toMatchObject({ code: "SCHEMA_TOO_DEEP", details: { step: "load" } });
    await expect(withStackOverflowReportedAsync("load", () => Promise.reject(other))).rejects.toBe(
      other,
    );
  });
});
