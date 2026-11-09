import { afterEach, describe, expect, it, vi } from "vitest";
import { c, debug, error, formatTime, walk, warn } from "../../src/api/legacy-utils.js";

/**
 * The deprecated logging exports write through the default logger to the global `console`
 * (ADR-004, decision 9). A recording console stands in for it, so the tests read what was written.
 */
class RecordingConsole {
  readonly lines: { level: string; text: string }[] = [];

  debug(text: string): void {
    this.lines.push({ level: "debug", text });
  }

  warn(text: string): void {
    this.lines.push({ level: "warn", text });
  }

  error(text: string): void {
    this.lines.push({ level: "error", text });
  }
}

/** The recorded lines without color codes. */
function plainLines(sink: RecordingConsole): { level: string; text: string }[] {
  return sink.lines.map(({ level, text }) => ({ level, text: c.unstyle(text) }));
}

function installRecordingConsole(): RecordingConsole {
  const sink = new RecordingConsole();
  vi.stubGlobal("console", sink);
  return sink;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("deprecated logging utilities", () => {
  it("warn writes a warning line", () => {
    const sink = installRecordingConsole();

    warn("careful");

    expect(plainLines(sink)).toEqual([{ level: "warn", text: " ⚠  careful" }]);
  });

  it("warn with silent writes nothing", () => {
    const sink = installRecordingConsole();

    warn("careful", true);

    expect(sink.lines).toEqual([]);
  });

  it("error writes an error line", () => {
    const sink = installRecordingConsole();

    error("broken");

    expect(plainLines(sink)).toEqual([{ level: "error", text: " ✘  broken" }]);
  });

  it("debug writes a line with the group and duration when DEBUG asks for the group", () => {
    vi.stubEnv("DEBUG", "openapi-ts:*");
    const sink = installRecordingConsole();

    debug("loaded", "redoc", 1500);

    // Debug lines go to stderr (`console.error`), so they never mix with types on stdout (#42).
    expect(plainLines(sink)).toEqual([{ level: "error", text: "  openapi-ts:redoc 1.5s loaded" }]);
  });

  it("debug writes nothing without DEBUG", () => {
    vi.stubEnv("DEBUG", "");
    const sink = installRecordingConsole();

    debug("loaded", "redoc");

    expect(sink.lines).toEqual([]);
  });
});

describe("formatTime", () => {
  it("formats milliseconds as the logger does", () => {
    expect([formatTime(12.34), formatTime(2500), formatTime(90_000)]).toEqual(["12.3ms", "2.5s", "1.5m"]);
  });

  it("returns a value that is not a number unchanged, as the original did", () => {
    const untyped = "soon" as unknown as number;

    expect(formatTime(untyped)).toBe("soon");
  });
});

describe("walk", () => {
  it("starts at an empty path when none is given", () => {
    const paths: string[] = [];

    walk({ a: {} }, (_value, path) => paths.push(path.join("/")));

    expect(paths).toEqual(["", "a"]);
  });
});
