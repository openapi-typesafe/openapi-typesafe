import { describe, expect, it } from "vitest";
import { selectTasks, TASK_CATEGORIES } from "../../src/domain/eval-task.ts";
import { AUTH, GET_PET, MIGRATE } from "../fakes/tasks.ts";

const CATALOG = [GET_PET, AUTH, MIGRATE];

describe("selectTasks", () => {
  it("returns every task when no ids are given", () => {
    expect(selectTasks(CATALOG, [])).toEqual(CATALOG);
  });

  it("returns the named tasks in catalog order", () => {
    expect(selectTasks(CATALOG, [MIGRATE.id, GET_PET.id])).toEqual([GET_PET, MIGRATE]);
  });

  it("throws on an unknown id", () => {
    expect(() => selectTasks(CATALOG, ["99-nothing", GET_PET.id])).toThrow(
      "Unknown task: 99-nothing",
    );
  });
});

describe("TASK_CATEGORIES", () => {
  it("lists every category once", () => {
    expect(new Set(TASK_CATEGORIES).size).toBe(TASK_CATEGORIES.length);
    expect(TASK_CATEGORIES).toContain("migration");
  });
});
