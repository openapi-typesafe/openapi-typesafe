/**
 * The version spec a renamed dependency gets. A plain version or range keeps its style (`^`, `~`
 * or exact) and gets the openapi-typesafe version; `catalog:` and `workspace:` stay, because they
 * point elsewhere; anything else (a tag, a URL, a file or an npm alias) is kept and reported.
 */

const VERSION_STYLE_RE = /^([\^~]|>=)?\d/;
const KEPT_PROTOCOLS = ["catalog:", "workspace:"] as const;

export type SpecDecision =
  | { readonly kind: "replaced"; readonly spec: string }
  | { readonly kind: "kept"; readonly spec: string; readonly isReported: boolean };

/** The new spec for a renamed dependency whose old spec was `spec`. */
export function migrateVersionSpec(spec: string, version: string): SpecDecision {
  if (KEPT_PROTOCOLS.some((protocol) => spec.startsWith(protocol))) {
    return { kind: "kept", spec, isReported: false };
  }
  const style = VERSION_STYLE_RE.exec(spec);
  if (style === null) {
    return { kind: "kept", spec, isReported: true };
  }
  // `>=` means "this or newer"; with a new package line, a caret range says the same safely.
  const prefix = style[1] === ">=" ? "^" : (style[1] ?? "");
  return { kind: "replaced", spec: `${prefix}${version}` };
}
