/**
 * The keys of the `operations` interface in one run. A repeated `operationId` (Redocly warns
 * about it) gave the interface two members of one name, which did not compile (TS2300). Now the
 * first operation with an ID keeps it, and each later one gets the lowest number from 2 whose key
 * no operation of the document has: the second `listItems` is `listItems2`, the name
 * `--make-paths-enum` gives it in `ApiPaths` too. Keys follow the order the operations are
 * transformed in, which is the document order (or the `--alphabetize` order).
 */
export class OperationKeys {
  private readonly written: ReadonlySet<string>;
  private readonly taken = new Set<string>();

  /** `written`: every operation key of the document; empty outside a document run. */
  constructor(written: ReadonlySet<string> = new Set()) {
    this.written = written;
  }

  /** The key of the next operation with this key, written or numbered. */
  keyFor(key: string): string {
    let unique = key;
    for (let count = 2; this.taken.has(unique); count += 1) {
      const candidate = `${key}${count}`;
      unique = this.written.has(candidate) ? unique : candidate;
    }
    this.taken.add(unique);
    return unique;
  }
}
