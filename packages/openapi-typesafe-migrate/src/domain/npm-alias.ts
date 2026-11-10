import { PACKAGE_RENAMES } from "./package-names.js";
import { migrateVersionSpec } from "./version-spec.js";

/**
 * `npm:` specs name a package from the registry under another name: an alias in package.json
 * (`"my-fetch": "npm:openapi-fetch@^0.13"`), and the npm specifiers of Deno (in `deno.json`
 * imports and in sources: `npm:openapi-fetch@0.13/path`, `npm:/openapi-fetch@0.13/`). The package
 * in them is renamed like any other, and the range gets the openapi-typesafe version.
 */

const NPM_PROTOCOL = "npm:";
const SCOPE_PREFIX = "@";
const PATH_SEPARATOR = "/";
const VERSION_SEPARATOR = "@";

/** The parts of `npm:[/]<name>[@<range>][/<path>]`; `rest` is the `/<path>` after the range. */
interface NpmSpec {
  readonly lead: string;
  readonly name: string;
  readonly range: string | undefined;
  readonly rest: string;
}

/** The end of the package name in `text`: a scoped name has one `/` inside. */
function nameEnd(text: string): number {
  const searchFrom = text.startsWith(SCOPE_PREFIX) ? text.indexOf(PATH_SEPARATOR) + 1 : 0;
  const ends = [VERSION_SEPARATOR, PATH_SEPARATOR]
    .map((separator) => text.indexOf(separator, Math.max(searchFrom, 1)))
    .filter((index) => index !== -1);
  return ends.length === 0 ? text.length : Math.min(...ends);
}

function parseNpmSpec(spec: string): NpmSpec | undefined {
  if (!spec.startsWith(NPM_PROTOCOL)) {
    return undefined;
  }
  const body = spec.slice(NPM_PROTOCOL.length);
  const lead = body.startsWith(PATH_SEPARATOR) ? PATH_SEPARATOR : "";
  const text = body.slice(lead.length);
  const end = nameEnd(text);
  const name = text.slice(0, end);
  if (!text.startsWith(VERSION_SEPARATOR, end)) {
    return { lead, name, range: undefined, rest: text.slice(end) };
  }
  const rangeEnd = text.indexOf(PATH_SEPARATOR, end);
  const restStart = rangeEnd === -1 ? text.length : rangeEnd;
  return { lead, name, range: text.slice(end + 1, restStart), rest: text.slice(restStart) };
}

/**
 * An `npm:` spec of an original package, renamed. `isReported` when its range was kept;
 * `isDeep` when it reaches into the package (`npm:openapi-fetch@0.13/dist/index.js`).
 */
export interface MigratedNpmSpec {
  readonly spec: string;
  readonly isReported: boolean;
  readonly isDeep: boolean;
}

/** Whether `spec` is an `npm:` specifier of an original package (`npm:openapi-fetch@^0.13`). */
export function isOldPackageNpmSpec(spec: string): boolean {
  const parsed = parseNpmSpec(spec);
  return parsed !== undefined && PACKAGE_RENAMES.has(parsed.name);
}

/**
 * The `npm:` spec with the openapi-typesafe package and version, or undefined when `spec` is not
 * an `npm:` spec of an original package. A spec without a range keeps none; a range that is not
 * a semver range (a tag) is kept and reported.
 */
export function migrateNpmSpec(spec: string, version: string): MigratedNpmSpec | undefined {
  const parsed = parseNpmSpec(spec);
  const renamed = parsed === undefined ? undefined : PACKAGE_RENAMES.get(parsed.name);
  if (parsed === undefined || renamed === undefined) {
    return undefined;
  }
  const head = `${NPM_PROTOCOL}${parsed.lead}${renamed}`;
  const isDeep = parsed.rest !== "" && parsed.rest !== PATH_SEPARATOR;
  if (parsed.range === undefined) {
    return { spec: `${head}${parsed.rest}`, isReported: false, isDeep };
  }
  const decision = migrateVersionSpec(parsed.range, version);
  const isReported = decision.kind === "kept" && decision.isReported;
  const migrated = `${head}${VERSION_SEPARATOR}${decision.spec}${parsed.rest}`;
  return { spec: migrated, isReported, isDeep };
}
