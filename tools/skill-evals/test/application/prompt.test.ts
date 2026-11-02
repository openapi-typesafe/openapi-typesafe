import { describe, expect, it } from "vitest";
import { buildPrompt } from "../../src/application/prompt.ts";
import { GET_PET } from "../fakes/tasks.ts";

describe("buildPrompt", () => {
  it("puts the project rules before the task", () => {
    const prompt = buildPrompt(GET_PET);

    expect(prompt).toMatch(/^You work in the TypeScript project/);
    expect(prompt).toContain("do not install packages");
    expect(prompt.endsWith(`Task: ${GET_PET.prompt}\n`)).toBe(true);
  });
});
