import { describe, expect, it } from "vitest";
import type { OwnedRequest } from "../../../../src/application/transform/footer/enum-owners.js";
import {
  BEST_SCHEMA_NAMES,
  FIRST_DECLARING_SCHEMA_NAMES,
  FIRST_SCHEMA_NAMES,
  type SharedEnum,
} from "../../../../src/application/transform/footer/shared-enum-names.js";

/** The names of shared `--dedupe-enums` enums at the end of a run (ADR-021, upstream #1683). */

function owned(name: string, extra: Partial<OwnedRequest["request"]> = {}): OwnedRequest {
  const request = {
    name,
    isComponentSchema: false,
    values: ["a"],
    metadata: [],
    walkedAt: `#${name}`,
    ...extra,
  };
  return { owner: name, ownName: `Run${name.replaceAll("/", "")}`, request };
}

const component = (name: string) => owned(name, { isComponentSchema: true });

function shared(key: string, ...requests: OwnedRequest[]): SharedEnum {
  return { key, requests };
}

describe("BEST_SCHEMA_NAMES", () => {
  it("namesOf ranks a component schema, then length, then code-unit order", () => {
    const names = BEST_SCHEMA_NAMES.namesOf([
      shared("k", owned("/Pet/state"), component("/LongerName")),
      shared("j", owned("/Pet/state"), owned("/Cat/state"), owned("/Cat/state")),
    ]);

    expect(names.get("k")).toBe("LongerName");
    expect(names.get("j")).toBe("CatState");
  });

  it("namesOf numbers the best name of a later key when every name is taken", () => {
    const names = BEST_SCHEMA_NAMES.namesOf([
      shared("b", owned("/Pet/state")),
      shared("a", owned("/Pet/state")),
    ]);

    expect([names.get("a"), names.get("b")]).toEqual(["PetState", "PetState_2"]);
  });

  it("namesOf skips a number that a schema gives as its own name", () => {
    const names = BEST_SCHEMA_NAMES.namesOf([
      shared("c", owned("/Pet/state")),
      shared("b", owned("/Pet/state")),
      shared("a", component("/PetState_2"), owned("/Pet/state")),
    ]);

    expect([names.get("a"), names.get("b"), names.get("c")]).toEqual([
      "PetState_2",
      "PetState",
      "PetState_3",
    ]);
  });

  it("namesOf skips a number that a later key's schema gives as its own name", () => {
    const names = BEST_SCHEMA_NAMES.namesOf([
      shared("a", owned("/Pet/state")),
      shared("b", owned("/Pet/state")),
      shared("c", component("/PetState_2")),
    ]);

    expect([names.get("b"), names.get("c")]).toEqual(["PetState_3", "PetState_2"]);
  });

  it("namesOf leaves out a schema only a $ref typed", () => {
    const names = BEST_SCHEMA_NAMES.namesOf([
      shared(
        "k",
        owned("/Pet/state"),
        owned("/A", { isComponentSchema: true, walkedAt: undefined }),
      ),
    ]);

    expect(names.get("k")).toBe("PetState");
  });

  it("namesOf gives an enum that only $refs typed its first request's name", () => {
    const names = BEST_SCHEMA_NAMES.namesOf([shared("k", owned("/A", { walkedAt: undefined }))]);

    expect(names.get("k")).toBe("RunA");
  });
});

describe("FIRST_SCHEMA_NAMES", () => {
  it("namesOf gives the first schema's name, as the original", () => {
    const names = FIRST_SCHEMA_NAMES.namesOf([
      shared("k", owned("/Pet/kind", { isOwnerReference: true }), owned("/Other")),
    ]);

    expect(names.get("k")).toBe("RunPetkind");
  });
});

describe("FIRST_DECLARING_SCHEMA_NAMES", () => {
  it("namesOf gives the first declaring schema's name, not a reference's", () => {
    const names = FIRST_DECLARING_SCHEMA_NAMES.namesOf([
      shared("k", owned("/Pet/kind", { isOwnerReference: true }), owned("/Other"), owned("/Later")),
    ]);

    expect(names.get("k")).toBe("RunOther");
  });

  it("namesOf gives an enum of references only its first request's name", () => {
    const names = FIRST_DECLARING_SCHEMA_NAMES.namesOf([
      shared("k", owned("/Pet/kind", { isOwnerReference: true })),
    ]);

    expect(names.get("k")).toBe("RunPetkind");
  });
});
