import type { CheckOutcome, ProjectChecks } from "../../src/application/ports.ts";

const PASSED: CheckOutcome = { isPassed: true, output: "" };

/** Fails the type check or the tests of the listed workspaces; passes everything else. */
export class ScriptedChecks implements ProjectChecks {
  readonly typechecked: string[] = [];
  readonly tested: string[] = [];
  readonly #failingTypecheck: ReadonlySet<string>;
  readonly #failingTests: ReadonlySet<string>;

  constructor(failing: { typecheck?: readonly string[]; tests?: readonly string[] } = {}) {
    this.#failingTypecheck = new Set(failing.typecheck ?? []);
    this.#failingTests = new Set(failing.tests ?? []);
  }

  async typecheck(directory: string): Promise<CheckOutcome> {
    this.typechecked.push(directory);
    return this.#failingTypecheck.has(directory)
      ? { isPassed: false, output: "error TS2304" }
      : PASSED;
  }

  async test(directory: string): Promise<CheckOutcome> {
    this.tested.push(directory);
    return this.#failingTests.has(directory) ? { isPassed: false, output: "1 failed" } : PASSED;
  }
}
