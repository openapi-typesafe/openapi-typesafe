import { describe, expect, it } from "vitest";
import { defaultLoggerOptions, type StreamColorSupport, streamSupportsColor } from "../../src/api/default-ports.js";

const BASIC_COLORS = { level: 1, hasBasic: true, has256: false, has16m: false } as const;
const NO_BASIC_COLORS = { level: 0, hasBasic: false, has256: false, has16m: false } as const;

/** stdout is a terminal, stderr is redirected to a log file. */
const TERMINAL_STDOUT: StreamColorSupport = { stdout: BASIC_COLORS, stderr: false };
/** stdout is redirected (the types piped on), stderr is a terminal. */
const TERMINAL_STDERR: StreamColorSupport = { stdout: false, stderr: BASIC_COLORS };

describe("streamSupportsColor", () => {
  it("streamSupportsColor with stdout on a terminal and stderr redirected colors only stdout", () => {
    expect(streamSupportsColor("stdout", TERMINAL_STDOUT)).toBe(true);
    expect(streamSupportsColor("stderr", TERMINAL_STDOUT)).toBe(false);
  });

  it("streamSupportsColor with a stream without basic colors is false", () => {
    expect(streamSupportsColor("stdout", { stdout: NO_BASIC_COLORS, stderr: false })).toBe(false);
  });
});

describe("defaultLoggerOptions", () => {
  it("defaultLoggerOptions with stderr redirected turns colors off", () => {
    expect(defaultLoggerOptions(false, TERMINAL_STDOUT).useColors).toBe(false);
  });

  it("defaultLoggerOptions with stderr on a terminal turns colors on", () => {
    expect(defaultLoggerOptions(false, TERMINAL_STDERR).useColors).toBe(true);
  });
});
