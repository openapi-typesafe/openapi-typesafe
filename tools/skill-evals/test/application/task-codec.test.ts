import { describe, expect, it } from "vitest";
import { parseTask } from "../../src/application/task-codec.ts";

const VALID = JSON.stringify({ title: "Read a pet", category: "typed-calls", prompt: "Do it." });

describe("parseTask", () => {
  it("parses a task file and takes the id from the directory", () => {
    expect(parseTask("03-get-pet-name", VALID)).toEqual({
      id: "03-get-pet-name",
      title: "Read a pet",
      category: "typed-calls",
      prompt: "Do it.",
    });
  });

  it("rejects a directory name without the number prefix", () => {
    expect(() => parseTask("get-pet", VALID)).toThrow('must look like "07-delete-pet"');
  });

  it("rejects text that is not JSON", () => {
    expect(() => parseTask("03-get-pet-name", "{")).toThrow("task.json is not JSON");
  });

  it("rejects an unknown category and unknown keys", () => {
    const invalid = JSON.stringify({ title: "t", category: "nope", prompt: "p", extra: 1 });

    expect(() => parseTask("03-get-pet-name", invalid)).toThrow(
      /invalid task\.json:[\s\S]*category/,
    );
  });
});
