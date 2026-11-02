/**
 * Compare strings by UTF-16 code units. Used instead of `localeCompare` for every committed or
 * reported order, because locale-aware order depends on the machine's ICU data and locale.
 */
export function compareOrdinal(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
