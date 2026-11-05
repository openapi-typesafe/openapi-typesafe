/**
 * The Paths Object rule (OpenAPI 3.1 §4.8.8): "Templated paths with the same hierarchy but
 * different templated names MUST NOT exist as they are identical." Such paths, `/a/{id}` and
 * `/a/{name}`, match the same URLs, so a client cannot tell which one a request is for.
 */

const PATH_PARAMETER_RE = /\{[^}]+\}/g;
const PATH_PREFIX = "/";
const UNNAMED_PARAMETER = "{}";

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The groups of paths that differ only in the names of their template parameters, each group in
 * document order, the groups in the order of their first path. Keys that are no path, such as an
 * `x-` extension, are left out.
 */
export function findIdenticalPathTemplates(document: unknown): string[][] {
  const paths = isObject(document) && isObject(document.paths) ? document.paths : {};
  const byHierarchy = new Map<string, string[]>();
  for (const url of Object.keys(paths)) {
    if (!url.startsWith(PATH_PREFIX) || !url.includes("{")) {
      continue;
    }
    const hierarchy = url.replace(PATH_PARAMETER_RE, UNNAMED_PARAMETER);
    byHierarchy.set(hierarchy, [...(byHierarchy.get(hierarchy) ?? []), url]);
  }
  return [...byHierarchy.values()].filter((urls) => urls.length > 1);
}
