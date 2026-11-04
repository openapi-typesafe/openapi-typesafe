import { describe, expect, it } from "vitest";
import { runChecker } from "../../src/adapters/checker-limit.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";

describe("runChecker", () => {
  it("runChecker returns the check's result", () => {
    expect(runChecker("out.ts", () => 3)).toBe(3);
  });

  it("runChecker turns a RangeError from TypeScript into CHECKER_LIMIT", () => {
    const run = () =>
      runChecker("out.ts", () => {
        throw new RangeError("Map maximum size exceeded");
      });

    expect(run).toThrow(
      expect.objectContaining({
        code: HarnessErrorCode.CheckerLimit,
        message: "TypeScript stopped on out.ts: Map maximum size exceeded",
      }),
    );
  });

  it("runChecker passes on any other error", () => {
    const run = () =>
      runChecker("out.ts", () => {
        throw new TypeError("bug");
      });

    expect(run).toThrow(TypeError);
  });
});
