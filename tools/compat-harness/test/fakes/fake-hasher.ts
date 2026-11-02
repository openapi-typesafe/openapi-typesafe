import type { Hasher } from "../../src/application/ports.ts";

/**
 * Deterministic stand-in for SHA-256: a 64-character hex string derived from the content, so it passes
 * the manifest schema. Not a real hash; collisions do not matter for the small test inputs.
 */
export class FakeHasher implements Hasher {
  sha256(content: string): string {
    let state = 0;
    for (const character of content) {
      state = (state * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
    }
    return state.toString(16).padStart(8, "0").repeat(8);
  }
}
