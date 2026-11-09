import { describe, expect, it } from "vitest";
import {
  createTerminalLogger,
  formatDuration,
  isDebugEnabled,
  type TerminalSink,
} from "../../../src/adapters/terminal-logger/terminal-logger.js";

class RecordingSink implements TerminalSink {
  readonly lines: string[] = [];

  debug(line: string): void {
    this.lines.push(`debug:${line}`);
  }

  warn(line: string): void {
    this.lines.push(`warn:${line}`);
  }

  error(line: string): void {
    this.lines.push(`error:${line}`);
  }
}

function loggerWith(options: { silent?: boolean; debugFilter?: string; useColors?: boolean }) {
  const sink = new RecordingSink();
  const logger = createTerminalLogger({
    silent: options.silent ?? false,
    debugFilter: options.debugFilter,
    useColors: options.useColors ?? false,
    sink,
  });
  return { logger, sink };
}

describe("formatDuration", () => {
  it.each([
    [12.34, "12.3ms"],
    [1500, "1.5s"],
    [90_000, "1.5m"],
  ])("formatDuration(%d) is %s", (milliseconds, text) => {
    expect(formatDuration(milliseconds)).toBe(text);
  });
});

describe("isDebugEnabled", () => {
  it.each([
    [undefined, "ts", false],
    ["", undefined, false],
    ["anything", undefined, true],
    ["*", "lint", true],
    ["openapi-ts:*", "bundle", true],
    ["OPENAPI-TS:TS", "ts", true],
    ["openapi-ts:redoc", "ts", false],
  ] as const)("isDebugEnabled(%j, %j) is %s", (filter, group, expected) => {
    expect(isDebugEnabled(filter, group)).toBe(expected);
  });
});

describe("createTerminalLogger", () => {
  it("warn writes the warning line unless silent", () => {
    const loud = loggerWith({});
    const quiet = loggerWith({ silent: true });

    loud.logger.warn("careful");
    quiet.logger.warn("careful");

    expect(loud.sink.lines).toEqual(["warn: ⚠  careful"]);
    expect(quiet.sink.lines).toEqual([]);
  });

  it("error writes the error line unless silent (#43)", () => {
    const loud = loggerWith({});
    const quiet = loggerWith({ silent: true });

    loud.logger.error("broken");
    quiet.logger.error("broken");

    expect(loud.sink.lines).toEqual(["error: ✘  broken"]);
    expect(quiet.sink.lines).toEqual([]);
  });

  it("debug writes its line also when silent, since DEBUG asked for it", () => {
    const { logger, sink } = loggerWith({ silent: true, debugFilter: "*" });

    logger.debug("Parsed schema");

    expect(sink.lines).toHaveLength(1);
  });

  it("debug writes the group and the duration when DEBUG asks for it", () => {
    const { logger, sink } = loggerWith({ debugFilter: "openapi-ts:*" });

    logger.debug("Bundled schema", "bundle", 12.34);

    expect(sink.lines).toEqual(["debug:  openapi-ts:bundle 12.3ms Bundled schema"]);
  });

  it("debug without a duration separates the group from the message with a space", () => {
    const { logger, sink } = loggerWith({ debugFilter: "openapi-ts:lint" });

    logger.debug("Ignored by the lint ignore file: a problem", "lint");

    expect(sink.lines).toEqual([
      "debug:  openapi-ts:lint Ignored by the lint ignore file: a problem",
    ]);
  });

  it("debug without a group or a duration writes the info group and a space", () => {
    const { logger, sink } = loggerWith({ debugFilter: "openapi-ts:*" });

    logger.debug("Started");

    expect(sink.lines).toEqual(["debug:  openapi-ts:info Started"]);
  });

  it("debug writes nothing without DEBUG", () => {
    const { logger, sink } = loggerWith({});

    logger.debug("Bundled schema", "bundle");

    expect(sink.lines).toEqual([]);
  });

  it("the logger colors its lines when colors are on", () => {
    const { logger, sink } = loggerWith({ useColors: true, debugFilter: "*" });

    logger.warn("careful");
    for (const group of ["redoc", "lint", "ts"] as const) {
      logger.debug("step", group);
    }

    expect(sink.lines.every((line) => line.includes("\u001b["))).toBe(true);
  });
});

describe("credentials in URLs", () => {
  it("every line hides the user info of URLs", () => {
    const { logger, sink } = loggerWith({ debugFilter: "*" });

    logger.debug("loading https://tok:SECRET@api.example/x.yaml", "redoc");
    logger.warn("redirected to http://tok:SECRET@api.example/y.yaml");
    logger.error("Failed to load http://tok:SECRET@api.example/z.yaml");

    expect(sink.lines.join("\n")).not.toContain("SECRET");
    expect(sink.lines).toHaveLength(3);
  });
});

describe("control characters", () => {
  it("every line shows the control characters of its message as escapes", () => {
    const { logger, sink } = loggerWith({ debugFilter: "*" });
    const forged = "/a\n::error title=x::forged\u001b[2K";

    logger.debug(`path ${forged}`, "ts");
    logger.warn(`path ${forged}`);
    logger.error(`path ${forged}`);

    expect(sink.lines).toEqual([
      "debug:  openapi-ts:ts path /a\\n::error title=x::forged\\u001b[2K",
      "warn: ⚠  path /a\\n::error title=x::forged\\u001b[2K",
      "error: ✘  path /a\\n::error title=x::forged\\u001b[2K",
    ]);
  });
});
