import type { IrType } from "../../../domain/ir/nodes.js";
import type { RefPointerChecks } from "../schema/schema-context.js";

/** The checks of one pass: the `$ref`s typed in place, and the types it wrote for the others. */
export class RecordedPointers implements RefPointerChecks {
  private readonly written = new Map<string, IrType>();
  private readonly inPlace: ReadonlySet<string>;

  constructor(inPlace: ReadonlySet<string>) {
    this.inPlace = inPlace;
  }

  isInPlace(ref: string): boolean {
    return this.inPlace.has(ref);
  }

  record(ref: string, type: IrType): void {
    this.written.set(ref, type);
  }

  /** The `$ref`s whose written type `isError` finds to be an error. */
  failing(isError: (type: IrType) => boolean): string[] {
    return [...this.written].filter(([, type]) => isError(type)).map(([ref]) => ref);
  }
}
