import type { IrType } from "../../../domain/ir/nodes.js";
import type { RefPointerChecks } from "../schema/schema-context.js";

/** What the evaluator reads for a written pointer type: `missing` is an error. */
export type PointerRead = "missing" | "never" | "other";

/** The `$ref`s an earlier pass found to type in place: errors, and types with no value. */
export interface PointersInPlace {
  readonly missing: ReadonlySet<string>;
  readonly never: ReadonlySet<string>;
}

export const NONE_IN_PLACE: PointersInPlace = { missing: new Set(), never: new Set() };

/** The checks of one pass: the `$ref`s typed in place, and the types it wrote for the others. */
export class RecordedPointers implements RefPointerChecks {
  private readonly written = new Map<string, IrType>();
  private readonly inPlace: PointersInPlace;

  constructor(inPlace: PointersInPlace = NONE_IN_PLACE) {
    this.inPlace = inPlace;
  }

  isInPlace(ref: string): boolean {
    return this.inPlace.missing.has(ref) || this.inPlace.never.has(ref);
  }

  isNeverRead(ref: string): boolean {
    // A pass reads each `$ref` once, so a `$ref` is in one of the sets only.
    return this.inPlace.never.has(ref);
  }

  record(ref: string, type: IrType): void {
    this.written.set(ref, type);
  }

  /** The `$ref`s whose written type `readOf` reads as an error or as having no value. */
  checked(readOf: (type: IrType) => PointerRead): PointersInPlace {
    const missing = new Set<string>();
    const never = new Set<string>();
    for (const [ref, type] of this.written) {
      const read = readOf(type);
      if (read !== "other") {
        (read === "missing" ? missing : never).add(ref);
      }
    }
    return { missing, never };
  }
}
