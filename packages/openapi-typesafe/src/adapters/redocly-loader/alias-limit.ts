import {
  ALIAS_EXPANSION_MAX_RATIO,
  countNodes,
  isAliasExpansionExcessive,
} from "../../domain/openapi/alias-expansion.js";

/**
 * The reason a parsed YAML document is refused, if its aliases expand it too far. The check runs
 * right after parsing, before Redocly or the generator walk the document (pre-beta test plan 10.2).
 */
export function aliasExpansionFailure(parsed: unknown): Error | undefined {
  const counts = countNodes(parsed);
  if (!isAliasExpansionExcessive(counts)) {
    return undefined;
  }
  return new Error(
    `YAML aliases expand the document from ${counts.stored} to ${counts.expanded} nodes, ` +
      `more than ${ALIAS_EXPANSION_MAX_RATIO} times its size`,
  );
}
