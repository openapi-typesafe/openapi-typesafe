import { describe, expect, it } from "vitest";
import { terminalSafeText } from "../../src/domain/terminal-text.js";

describe("terminalSafeText", () => {
  it("terminalSafeText shows line breaks and escape sequences as escapes", () => {
    expect(terminalSafeText("a\nb\r\u001b[2Kc")).toBe("a\\nb\\r\\u001b[2Kc");
  });

  it("terminalSafeText shows DEL, C1, separator and bidirectional controls as escapes", () => {
    expect(terminalSafeText("\u007f\u0085\u009b  ‮⁦⁩")).toBe(
      "\\u007f\\u0085\\u009b\\u2028\\u2029\\u202e\\u2066\\u2069",
    );
  });

  it("terminalSafeText keeps tabs, plain text and other characters as they are", () => {
    const text = "a\tb ünï 名前     🚀 ~";

    expect(terminalSafeText(text)).toBe(text);
  });
});
