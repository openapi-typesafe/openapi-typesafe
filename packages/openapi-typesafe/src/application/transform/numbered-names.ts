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

/** Separates a repeated declaration name from its number: `Status` → `Status_2`. */
const DECLARATION_NUMBER_SEPARATOR = "_";

/**
 * The first of `Name_2`, `Name_3`, … that `taken` does not hold: the suffix `--root-types` uses for
 * its own conflicts, and every other declaration that must give way to another name.
 */
export function freeNumberedName(name: string, taken: ReadonlySet<string>): string {
  let count = 2;
  while (taken.has(`${name}${DECLARATION_NUMBER_SEPARATOR}${count}`)) {
    count += 1;
  }
  return `${name}${DECLARATION_NUMBER_SEPARATOR}${count}`;
}
