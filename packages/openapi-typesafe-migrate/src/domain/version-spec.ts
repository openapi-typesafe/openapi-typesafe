/**
 * The version spec a renamed dependency gets. A semver range keeps its style and gets the
 * openapi-typesafe version: `^` and `>=` give `^`, `~` gives `~`, an exact version stays exact,
 * and a partial version keeps what it fixes (`7` and `7.x` fix the major: `^`; `0.13` and
 * `0.13.x` fix the minor: `~`). A range of several comparators takes the style of its first one.
 * `catalog:` and `workspace:` stay, because they point elsewhere (a dependency on a local package
 * keeps its old name too, domain/dependency-map.ts); anything else (a tag, `*`, an
 * upper bound only, a URL, a file or an npm alias) is kept and reported.
 */

const KEPT_PROTOCOLS = ["catalog:", "workspace:"] as const;
/**
 * The protocols of specs that point at a package on disk (pnpm, Yarn, npm, bun), not at the npm
 * registry: such a dependency is a local package that only shares an original package's name.
 */
const LOCAL_PROTOCOLS = ["workspace:", "link:", "file:", "portal:"] as const;
const RANGE_SEPARATOR = "||";
const HYPHEN = "-";
const WHITE_SPACE_RE = /\s+/;
/** node-semver allows white space between an operator and its version: `>= 1.2.3`. */
const SPACED_OPERATOR_RE = /(<=|>=|<|>|=|~>|~|\^)\s+/g;
const OPERATOR = String.raw`(<=|>=|<|>|=|~>|~|\^)?`;
const VERSION_PART = String.raw`(\d+|[xX*])`;
const LABELS = String.raw`(?:-[\w.-]+)?(?:\+[\w.-]+)?`;
/** A comparator: an operator, then a version whose parts can be `x` or `*` or left out. */
const COMPARATOR_RE = new RegExp(
  String.raw`^${OPERATOR}v?${VERSION_PART}(?:\.${VERSION_PART})?(?:\.${VERSION_PART})?${LABELS}$`,
);
const NUMBER_RE = /^\d+$/;

/** The style a replaced spec keeps: `^`, `~` or exact (no operator). */
type RangeStyle = "^" | "~" | "";

const OPERATOR_STYLES: Readonly<Record<string, RangeStyle | undefined>> = {
  "^": "^",
  // `>=` means "this or newer"; with a new package line, a caret range says the same safely.
  ">=": "^",
  ">": "^",
  "~": "~",
  "~>": "~",
};

export type SpecDecision =
  | { readonly kind: "replaced"; readonly spec: string }
  | { readonly kind: "kept"; readonly spec: string; readonly isReported: boolean };

const isNumber = (part: string | undefined): boolean => part !== undefined && NUMBER_RE.test(part);

/** The style of a comparator without an operator (or `=`), by the parts it fixes. */
function versionStyle(
  major: string | undefined,
  minor: string | undefined,
  patch: string | undefined,
): RangeStyle | undefined {
  if (!isNumber(major)) {
    return undefined;
  }
  if (isNumber(minor) && isNumber(patch)) {
    return "";
  }
  return isNumber(minor) ? "~" : "^";
}

/** The style of the first comparator of a range, or undefined when the spec is not a range. */
function rangeStyle(spec: string): RangeStyle | undefined {
  const sets = spec.replace(SPACED_OPERATOR_RE, "$1").split(RANGE_SEPARATOR);
  const tokens = sets.map((set) => set.trim().split(WHITE_SPACE_RE));
  const comparators = tokens.flat().filter((token) => token !== HYPHEN);
  const matches = comparators.map((comparator) => COMPARATOR_RE.exec(comparator));
  const first = matches[0];
  if (first === undefined || first === null || matches.includes(null)) {
    return undefined;
  }
  const operator = first[1];
  // `1.2.3 - 2.0.0` is `>=1.2.3 <=2.0.0`: a lower bound, as `>=` is.
  const isHyphenRange = tokens[0]?.[1] === HYPHEN;
  if (operator !== undefined && operator !== "=") {
    return OPERATOR_STYLES[operator];
  }
  return isHyphenRange ? "^" : versionStyle(first[2], first[3], first[4]);
}

/** True for a spec that points at a package on disk: `workspace:*`, `link:../fork`, `file:…`. */
export const isLocalPackageSpec = (spec: string): boolean =>
  LOCAL_PROTOCOLS.some((protocol) => spec.startsWith(protocol));

/** The new spec for a renamed dependency whose old spec was `spec`. */
export function migrateVersionSpec(spec: string, version: string): SpecDecision {
  if (KEPT_PROTOCOLS.some((protocol) => spec.startsWith(protocol))) {
    return { kind: "kept", spec, isReported: false };
  }
  const style = rangeStyle(spec);
  if (style === undefined) {
    return { kind: "kept", spec, isReported: true };
  }
  return { kind: "replaced", spec: `${style}${version}` };
}
