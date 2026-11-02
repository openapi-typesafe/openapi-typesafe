import type { CallbackRewriter } from "../../src/application/ports.js";
import { type FileMigration, unchanged } from "../../src/domain/migration-findings.js";

/** A rewriter that appends a marker to the files it is given results for, and records calls. */
export class StubCallbackRewriter implements CallbackRewriter {
  readonly calls: { text: string; path: string }[] = [];
  readonly #results: ReadonlyMap<string, FileMigration>;

  constructor(results: Readonly<Record<string, FileMigration>> = {}) {
    this.#results = new Map(Object.entries(results));
  }

  rewrite(text: string, path: string): FileMigration {
    this.calls.push({ text, path });
    return this.#results.get(path) ?? unchanged(text);
  }
}
