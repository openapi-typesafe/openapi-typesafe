import {
  COMPONENT_KINDS,
  type ComponentsObject,
  DECLARED_COMPONENT_KINDS,
} from "../../../domain/openapi/components-object.js";
import type { DocumentObject } from "../../../domain/openapi/document-object.js";
import { isDeprecated } from "../document-entries.js";
import type { RefResolver } from "../schema/schema-context.js";

/**
 * `--exclude-deprecated` and references (roadmap R10.3, backlog 29). A deprecated component is
 * left out, but a kept schema may still point to it (an array's `items`, say), and the output then
 * names a missing `components` key. This scan finds the deprecated components that the kept output
 * references, so they are kept too. It follows the generator's rules: a property, parameter or
 * operation whose (resolved) object is deprecated is dropped, so its `$ref` does not count. Keys
 * that are not typed are not followed, so a component they name stays out, as before.
 */

/** Keys whose contents the generator does not type. */
const UNTYPED_KEYS: ReadonlySet<string> = new Set([
  "callbacks",
  "discriminator",
  "example",
  "examples",
  "externalDocs",
  "links",
  "security",
  "securitySchemes",
  "servers",
  "xml",
]);
const EXTENSION_PREFIX = "x-";
/** Keys whose entries the generator drops when the entry or its `$ref` target is deprecated. */
const RESOLVED_ENTRY_KEYS: ReadonlySet<string> = new Set([
  "properties",
  "parameters",
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
]);
const COMPONENTS_PREFIX = "#/components/";

interface Scan {
  readonly refs: RefResolver;
  /** The deprecated components to keep, as the document's own objects. */
  readonly kept: Set<object>;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function refOf(value: unknown): string | undefined {
  return isObject(value) && typeof value.$ref === "string" ? value.$ref : undefined;
}

/** Whether a dropped-when-deprecated entry is dropped: its own or its target's `deprecated`. */
function isDroppedEntry(value: unknown, scan: Scan): boolean {
  const ref = refOf(value);
  return isDeprecated(value) || (ref !== undefined && isDeprecated(scan.refs.resolve(ref)));
}

/** A `$ref` to a deprecated component keeps it, and the component is scanned once. */
function visitRef(ref: string, scan: Scan): void {
  const target = ref.startsWith(COMPONENTS_PREFIX) ? scan.refs.resolve(ref) : undefined;
  if (isObject(target) && isDeprecated(target) && !scan.kept.has(target)) {
    scan.kept.add(target);
    visitContents(target, scan);
  }
}

function visitEntries(value: unknown, scan: Scan): void {
  for (const entry of Array.isArray(value) ? value : Object.values(value as object)) {
    if (!isDroppedEntry(entry, scan)) {
      visit(entry, scan);
    }
  }
}

/** A node of kept output; a deprecated object here is dropped, so it is not followed. */
function visit(node: unknown, scan: Scan): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      visit(item, scan);
    }
  } else if (isObject(node) && !isDeprecated(node)) {
    visitContents(node, scan);
  }
}

/** The `$ref` and the typed keys of an object. */
function visitContents(node: Readonly<Record<string, unknown>>, scan: Scan): void {
  const ref = refOf(node);
  if (ref !== undefined) {
    visitRef(ref, scan);
  }
  for (const [key, value] of Object.entries(node)) {
    if (UNTYPED_KEYS.has(key) || key.startsWith(EXTENSION_PREFIX) || !isObject(value)) {
      continue;
    }
    if (RESOLVED_ENTRY_KEYS.has(key)) {
      visitEntries(key === "properties" || key === "parameters" ? value : [value], scan);
    } else {
      visit(value, scan);
    }
  }
}

/** The kept (not deprecated) entries of the typed component kinds. */
function keptComponentEntries(components: ComponentsObject | undefined): unknown[] {
  const kinds = [...COMPONENT_KINDS, ...DECLARED_COMPONENT_KINDS];
  return kinds.flatMap((kind) =>
    Object.values(components?.[kind] ?? {}).filter((item) => !isDeprecated(item)),
  );
}

/**
 * The deprecated components that kept output references, as the objects of `document.components`
 * (the resolver returns those), so names that need escaping in a `$ref` match too.
 */
export function keptDeprecatedComponents(
  document: DocumentObject,
  refs: RefResolver,
): ReadonlySet<object> {
  const scan: Scan = { refs, kept: new Set() };
  visit([document.paths, document.webhooks, document.$defs], scan);
  visit(keptComponentEntries(document.components), scan);
  return scan.kept;
}
