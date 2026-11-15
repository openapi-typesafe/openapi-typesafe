import { describe, expect, it } from "vitest";
import {
  FIRST_SCHEMA_NAMES,
  SharedEnumNameRecorder,
} from "../../../../src/application/transform/footer/shared-enum-names.js";

/** The names of shared `--dedupe-enums` enums (`dedupe-enum-names` fix, upstream #1683). */

function request(name: string, isComponentSchema = false) {
  return { name, isComponentSchema, values: ["a"], metadata: [], walkedAt: `#${name}` };
}

describe("SharedEnumNameRecorder", () => {
  it("nameOf keeps the run's own name in the first pass", () => {
    expect(new SharedEnumNameRecorder().nameOf("k", "Own", request("/Pet/state"))).toBe("Own");
  });

  it("chosenNames ranks a component schema, then length, then code-unit order", () => {
    const recorder = new SharedEnumNameRecorder();
    recorder.nameOf("k", "", request("/Pet/state"));
    recorder.nameOf("k", "", request("/LongerName", true));
    recorder.nameOf("j", "", request("/Pet/state"));
    recorder.nameOf("j", "", request("/Cat/state"));
    recorder.nameOf("j", "", request("/Cat/state"));

    const names = recorder.chosenNames();

    expect(names.nameOf("k", "First", request("/x"))).toBe("LongerName");
    expect(names.nameOf("j", "First", request("/x"))).toBe("CatState");
  });

  it("chosenNames numbers the best name of a later key when every name is taken", () => {
    const recorder = new SharedEnumNameRecorder();
    recorder.nameOf("b", "", request("/Pet/state"));
    recorder.nameOf("a", "", request("/Pet/state"));

    const names = recorder.chosenNames();

    expect(names.nameOf("a", "", request("/x"))).toBe("PetState");
    expect(names.nameOf("b", "", request("/x"))).toBe("PetState_2");
  });

  it("chosenNames skips a number that a schema gives as its own name", () => {
    const recorder = new SharedEnumNameRecorder();
    recorder.nameOf("c", "", request("/Pet/state"));
    recorder.nameOf("b", "", request("/Pet/state"));
    recorder.nameOf("a", "", request("/PetState_2", true));
    recorder.nameOf("a", "", request("/Pet/state"));

    const names = recorder.chosenNames();

    expect(names.nameOf("a", "", request("/x"))).toBe("PetState_2");
    expect(names.nameOf("b", "", request("/x"))).toBe("PetState");
    expect(names.nameOf("c", "", request("/x"))).toBe("PetState_3");
  });

  it("chosenNames skips a number that a later key's schema gives as its own name", () => {
    const recorder = new SharedEnumNameRecorder();
    recorder.nameOf("a", "", request("/Pet/state"));
    recorder.nameOf("b", "", request("/Pet/state"));
    recorder.nameOf("c", "", request("/PetState_2", true));

    const names = recorder.chosenNames();

    expect(names.nameOf("b", "", request("/x"))).toBe("PetState_3");
    expect(names.nameOf("c", "", request("/x"))).toBe("PetState_2");
  });

  it("chosenNames gives each later key of one best name its own number", () => {
    const recorder = new SharedEnumNameRecorder();
    for (const key of ["a", "b", "c"]) {
      recorder.nameOf(key, "", request("/Pet/state"));
    }

    const names = recorder.chosenNames();

    expect(["a", "b", "c"].map((key) => names.nameOf(key, "", request("/x")))).toEqual([
      "PetState",
      "PetState_2",
      "PetState_3",
    ]);
  });

  it("chosenNames leaves out a schema only a $ref typed", () => {
    const recorder = new SharedEnumNameRecorder();
    recorder.nameOf("k", "", request("/Pet/state"));
    const { walkedAt: _walked, ...throughRef } = request("/A", true);
    recorder.nameOf("k", "", throughRef);

    const names = recorder.chosenNames();

    expect(names.nameOf("k", "", request("/x"))).toBe("PetState");
  });

  it("chosenNames gives the run's name for a key it did not record", () => {
    expect(new SharedEnumNameRecorder().chosenNames().nameOf("k", "Own", request("/x"))).toBe(
      "Own",
    );
  });
});

describe("FIRST_SCHEMA_NAMES", () => {
  it("nameOf gives the first schema's name, as the original", () => {
    expect(FIRST_SCHEMA_NAMES.nameOf("k", "Own", request("/x"))).toBe("Own");
  });
});
