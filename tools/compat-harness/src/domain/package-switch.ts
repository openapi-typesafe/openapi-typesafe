/**
 * The mechanical "switch by package name only" of ENGINEERING_PLAN 8.4: every original package
 * becomes its openapi-typesafe counterpart in `package.json` files, generator calls in scripts,
 * and module specifiers in source files. Nothing else in a project changes.
 */

/** Original package name → openapi-typesafe package name. */
export const PACKAGE_RENAMES = {
  "openapi-typescript": "openapi-typesafe",
  "openapi-fetch": "openapi-typesafe-fetch",
  "openapi-react-query": "openapi-typesafe-react-query",
  "openapi-typescript-helpers": "openapi-typesafe-helpers",
} as const;

type OriginalPackage = keyof typeof PACKAGE_RENAMES;

/**
 * The upstream releases of tag `fork-base`: the latest releases when the fork started. A project
 * pinned to an older upstream release can break on upstream changes alone, so the baseline runs
 * on these versions.
 */
export const UPSTREAM_BASE_VERSIONS: Readonly<Record<OriginalPackage, string>> = {
  "openapi-typescript": "7.13.0",
  "openapi-fetch": "0.17.0",
  "openapi-react-query": "0.5.4",
  "openapi-typescript-helpers": "0.1.0",
};

export type SwitchedPackage = (typeof PACKAGE_RENAMES)[OriginalPackage];

/** Version specifier to install each switched package from, for example a `file:` tarball. */
export type SwitchedPackageSpecs = Readonly<Record<SwitchedPackage, string>>;

/** Extensions of files whose module specifiers are switched. */
export const SOURCE_FILE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
] as const;

/** Result of switching one file: the new text and how many replacements were made. */
export interface SwitchedText {
  readonly text: string;
  readonly replacementCount: number;
}

const INSTALLED_DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];
const PEER_DEPENDENCY_FIELD = "peerDependencies";
/**
 * The switched packages are unpublished (version 0.0.0), so no original peer range can match
 * them; a peer range only states compatibility, so any version is accepted.
 */
const SWITCHED_PEER_RANGE = "*";

const isOriginalPackage = (name: string): name is OriginalPackage =>
  Object.hasOwn(PACKAGE_RENAMES, name);

const SWITCHED_PACKAGES: ReadonlySet<string> = new Set(Object.values(PACKAGE_RENAMES));

const isSwitchedPackage = (name: string): name is SwitchedPackage => SWITCHED_PACKAGES.has(name);

/** The generator binary as a whole word, not a part of `openapi-typescript-helpers` or a path. */
const GENERATOR_COMMAND = /(?<![\w@/.-])openapi-typescript(?![\w-])/g;
const SWITCHED_GENERATOR_COMMAND = PACKAGE_RENAMES["openapi-typescript"];

/** A quoted module specifier of an original package, optionally with a subpath. */
const MODULE_SPECIFIER = new RegExp(
  `(["'])(${Object.keys(PACKAGE_RENAMES).join("|")})(/[^"'\\s]*)?\\1`,
  "g",
);

const INDENT = /^\{\r?\n([ \t]+)"/;
const DEFAULT_INDENT = "  ";

type JsonObject = Record<string, unknown>;

/** A switched copy of one `package.json` field and the number of replacements in it. */
interface FieldSwitch {
  readonly value: JsonObject;
  readonly replacementCount: number;
}

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** New name and spec of an original package in one dependency map. */
type DependencyRewrite = (name: OriginalPackage) => readonly [name: string, spec: string];

/** Rewrite the original packages of one dependency map, keeping the key order. */
function rewriteDependencies(dependencies: JsonObject, rewrite: DependencyRewrite): FieldSwitch {
  let replacementCount = 0;
  const entries = Object.entries(dependencies).map(([name, spec]): readonly [string, unknown] => {
    if (!isOriginalPackage(name)) {
      return [name, spec];
    }
    replacementCount++;
    return rewrite(name);
  });
  return { value: Object.fromEntries(entries), replacementCount };
}

/** Switch the generator command inside every script. */
function switchScripts(scripts: JsonObject): FieldSwitch {
  let replacementCount = 0;
  const entries = Object.entries(scripts).map(([name, script]): [string, unknown] => {
    if (typeof script !== "string") {
      return [name, script];
    }
    const switched = script.replace(GENERATOR_COMMAND, () => {
      replacementCount++;
      return SWITCHED_GENERATOR_COMMAND;
    });
    return [name, switched];
  });
  return { value: Object.fromEntries(entries), replacementCount };
}

type FieldTransforms = Readonly<Record<string, (value: JsonObject) => FieldSwitch>>;

/**
 * Apply field transforms to a `package.json` text. The indentation is kept; an unchanged or
 * non-object manifest is returned as is.
 */
function rewriteManifest(text: string, transforms: FieldTransforms): SwitchedText {
  const parsed: unknown = JSON.parse(text);
  if (!isJsonObject(parsed)) {
    return { text, replacementCount: 0 };
  }
  const rewritten: JsonObject = { ...parsed };
  let replacementCount = 0;
  for (const [field, transform] of Object.entries(transforms)) {
    const value = parsed[field];
    if (isJsonObject(value)) {
      const result = transform(value);
      rewritten[field] = result.value;
      replacementCount += result.replacementCount;
    }
  }
  if (replacementCount === 0) {
    return { text, replacementCount };
  }
  return { text: encodeManifest(rewritten, text), replacementCount };
}

/** Serialize a changed manifest with the indentation and final newline of the original text. */
function encodeManifest(value: JsonObject, originalText: string): string {
  const indent = INDENT.exec(originalText)?.[1] ?? DEFAULT_INDENT;
  const finalNewline = originalText.endsWith("\n") ? "\n" : "";
  return `${JSON.stringify(value, null, indent)}${finalNewline}`;
}

/** The same transform for every field a package manager installs from. */
const installedFields = (rewrite: DependencyRewrite): FieldTransforms =>
  Object.fromEntries(
    INSTALLED_DEPENDENCY_FIELDS.map((field) => [
      field,
      (value: JsonObject) => rewriteDependencies(value, rewrite),
    ]),
  );

/**
 * Switch a `package.json` text: original dependencies are replaced by the switched packages at
 * the given specs (peer dependencies accept any version), and generator calls in scripts use the
 * new binary.
 */
export function switchPackageManifest(text: string, specs: SwitchedPackageSpecs): SwitchedText {
  return rewriteManifest(text, {
    ...installedFields((name) => [PACKAGE_RENAMES[name], specs[PACKAGE_RENAMES[name]]]),
    [PEER_DEPENDENCY_FIELD]: (value) =>
      rewriteDependencies(value, (name) => [PACKAGE_RENAMES[name], SWITCHED_PEER_RANGE]),
    scripts: switchScripts,
  });
}

/**
 * Pin the original packages of a `package.json` text to the upstream releases the fork starts
 * from, so a baseline run differs from the candidate run by the switch alone.
 */
export function pinUpstreamVersions(text: string): SwitchedText {
  return rewriteManifest(
    text,
    installedFields((name) => [name, UPSTREAM_BASE_VERSIONS[name]]),
  );
}

/** Switch quoted module specifiers (`"openapi-fetch"`, `'openapi-typescript/x'`) in source text. */
export function switchModuleSpecifiers(text: string): SwitchedText {
  let replacementCount = 0;
  const switched = text.replace(
    MODULE_SPECIFIER,
    (_match, quote: string, name: OriginalPackage, subpath: string | undefined) => {
      replacementCount++;
      return `${quote}${PACKAGE_RENAMES[name]}${subpath ?? ""}${quote}`;
    },
  );
  return { text: switched, replacementCount };
}

/**
 * Point the dependencies of a packed openapi-typesafe package on its sibling packages at the given
 * specs. The packages are unpublished, so a version range would send the installer to a registry
 * that does not have them.
 */
export function pinSwitchedDependencies(text: string, specs: SwitchedPackageSpecs): SwitchedText {
  return rewriteManifest(text, {
    dependencies: (dependencies) => {
      let replacementCount = 0;
      const entries = Object.entries(dependencies).map(([name, spec]) => {
        if (!isSwitchedPackage(name)) {
          return [name, spec];
        }
        replacementCount++;
        return [name, specs[name]];
      });
      return { value: Object.fromEntries(entries), replacementCount };
    },
  });
}
