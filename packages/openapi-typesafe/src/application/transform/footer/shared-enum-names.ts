import type { EnumDeclarationRequest } from "../schema/schema-context.js";
import { EnumNaming } from "./enum-naming.js";

/**
 * How `--dedupe-enums` names the one enum that schemas with the same members share. `key` is the
 * dedupe key of the members; `name` is the name the schema gives with the run's naming state.
 */
export interface SharedEnumNames {
  /** Called for every schema of the enum, in document order; returns the name to declare. */
  nameOf(key: string, name: string, request: EnumDeclarationRequest): string;
}

/** The original: the enum takes the name of the first schema in the document. */
export const FIRST_SCHEMA_NAMES: SharedEnumNames = { nameOf: (_key, name) => name };

interface NameCandidate {
  readonly name: string;
  readonly isComponentSchema: boolean;
}

/**
 * Whether `candidate` names the enum better than `other`: a component schema that is the enum
 * itself, then the shorter name, then the earlier one in code-unit order. No part depends on the
 * document order, so adding or moving a schema changes the name only when the new one ranks first.
 */
function isBetterName(candidate: NameCandidate, other: NameCandidate): boolean {
  if (candidate.isComponentSchema !== other.isComponentSchema) {
    return candidate.isComponentSchema;
  }
  if (candidate.name.length !== other.name.length) {
    return candidate.name.length < other.name.length;
  }
  return candidate.name < other.name;
}

/** The candidates from best to worst. */
function ranked(candidates: readonly NameCandidate[]): NameCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.name === right.name && left.isComponentSchema === right.isComponentSchema) {
      return 0;
    }
    return isBetterName(left, right) ? -1 : 1;
  });
}

/**
 * The `dedupe-enum-names` fix (ADR-021, upstream #1683), first pass: records every schema of each
 * shared enum and keeps the run's own names. `chosenNames` gives the names for the second pass.
 */
export class SharedEnumNameRecorder implements SharedEnumNames {
  private readonly candidatesByKey = new Map<string, NameCandidate[]>();

  nameOf(key: string, name: string, request: EnumDeclarationRequest): string {
    // A fresh naming state: the run's state depends on the names built before (EnumNaming).
    const candidate = {
      name: new EnumNaming().enumName(request.name),
      isComponentSchema: request.isComponentSchema,
    };
    const candidates = this.candidatesByKey.get(key);
    if (candidates === undefined) {
      this.candidatesByKey.set(key, [candidate]);
    } else {
      candidates.push(candidate);
    }
    return name;
  }

  /**
   * The best name of each enum. Two enums whose best names are the same (two schemas that give
   * one name) are resolved in key order: the later one takes its next name that is free.
   */
  chosenNames(): SharedEnumNames {
    const chosen = new Map<string, string>();
    const taken = new Set<string>();
    const keys = [...this.candidatesByKey.keys()].sort();
    for (const key of keys) {
      const names = ranked(this.candidatesByKey.get(key) ?? []).map(({ name }) => name);
      const name = names.find((candidate) => !taken.has(candidate)) ?? names[0];
      if (name !== undefined) {
        chosen.set(key, name);
        taken.add(name);
      }
    }
    return { nameOf: (key, name) => chosen.get(key) ?? name };
  }
}
