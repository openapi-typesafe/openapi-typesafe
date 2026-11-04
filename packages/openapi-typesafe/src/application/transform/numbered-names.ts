/** Builds the name for the `count`-th use of `name` (2, 3…). */
export type NumberedName = (name: string, count: number) => string;

/**
 * Names made unique, in order: the first use of a name keeps it, each repeat gets the lowest
 * number from 2 whose name is not written anywhere in the list.
 */
export function withNumberedRepeats(names: readonly string[], numbered: NumberedName): string[] {
  const written = new Set(names);
  const taken = new Set<string>();
  return names.map((name) => {
    let unique = name;
    for (let count = 2; taken.has(unique); count += 1) {
      const candidate = numbered(name, count);
      unique = written.has(candidate) ? unique : candidate;
    }
    taken.add(unique);
    return unique;
  });
}
