import { describe, expect, it } from "vitest";
import { DEFAULT_PRINT_OPTIONS } from "../../../src/application/print/print-options.js";
import { TextWriter } from "../../../src/application/print/text-writer.js";

describe("TextWriter", () => {
  it("text joins everything written, indented where a line starts", () => {
    const writer = new TextWriter(DEFAULT_PRINT_OPTIONS);

    writer.write("a {");
    writer.writeLine();
    writer.increaseIndent();
    writer.write("b;");
    writer.writeLine();

    expect(writer.text).toBe("a {\n    b;\n");
  });

  it("text read before more is written still gives the whole text after it", () => {
    const writer = new TextWriter(DEFAULT_PRINT_OPTIONS);
    writer.write("first");

    const early = writer.text;
    writer.rawWrite(" second");

    expect(early).toBe("first");
    expect(writer.text).toBe("first second");
    expect(writer.text).toBe("first second");
  });
});
