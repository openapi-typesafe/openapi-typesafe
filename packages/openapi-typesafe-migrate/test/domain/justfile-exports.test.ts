import { describe, expect, it } from "vitest";
import { migrateJustfile } from "../../src/domain/justfile-migration.js";

/** `${FLAGS}`, built so that no string holds the text of a template placeholder. */
const BRACED_FLAGS = ["$", "{FLAGS}"].join("");

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

const flagsStep = (line: number, variable: string) => ({
  kind: "flags-in-variable",
  location: `justfile:${line}`,
  variable,
  flags: ["-it"],
});

describe("migrateJustfile and exported variables", () => {
  it("migrateJustfile reports the old flags of an exported variable used as a shell variable", () => {
    const text = lines(
      `export FLAGS := "-it"`,
      `LOCAL := "-it"`,
      "types:",
      "    npx openapi-typescript a.yaml $FLAGS",
      `    npx openapi-typescript b.yaml ${BRACED_FLAGS}`,
      "    npx openapi-typescript c.yaml $LOCAL",
    );

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.manualSteps).toEqual([flagsStep(4, "$FLAGS"), flagsStep(5, BRACED_FLAGS)]);
  });

  it("migrateJustfile reports the old flags of an exported recipe parameter", () => {
    const text = lines(
      `types $OPTS="-it" other="-it":`,
      "    npx openapi-typescript a.yaml $OPTS",
      "    npx openapi-typescript b.yaml $other",
    );

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.manualSteps).toEqual([flagsStep(2, "$OPTS")]);
  });

  it("migrateJustfile reads every variable as exported with set export", () => {
    const text = lines(
      "set export := true",
      `FLAGS := "-it"`,
      `GEN := "npx openapi-typescript"`,
      "types:",
      "    $GEN a.yaml $FLAGS -it",
    );

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toContain("$GEN a.yaml $FLAGS --immutable");
    expect(migrated.manualSteps).toEqual([flagsStep(5, "$FLAGS")]);
  });

  it("migrateJustfile reads set export with a comment after it", () => {
    const text = lines("set export # all", `FLAGS := "-it"`, "t:", "    openapi-typescript $FLAGS");

    expect(migrateJustfile(text, "justfile").manualSteps).toEqual([flagsStep(4, "$FLAGS")]);
  });
});
