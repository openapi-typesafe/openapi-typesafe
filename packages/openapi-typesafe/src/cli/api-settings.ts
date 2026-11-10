import { kebabCase } from "scule";
import type { OutputFixName } from "../domain/output-fixes.js";
import { WARNING_CODES, warningText } from "../domain/warnings.js";
import { GENERATOR_FLAGS, type GeneratorFlags, hostList } from "./cli-arguments.js";
import { ApiFailure, cliError } from "./cli-errors.js";
import { fixNamesOf } from "./fix-option.js";
import { localRootUrl, type RefLimitOptions } from "./ref-limits.js";

/**
 * The settings of one API in `redocly.yaml` (`apis.<name>.x-openapi-ts`). A setting has the name
 * of its CLI flag, in kebab-case or camelCase (ADR-021, decision 1); a setting the CLI does not
 * read gets a warning, as an unknown flag gets a notice.
 */

export type ApiSettings = Readonly<Record<string, unknown>>;

/** The setting that names the output file. */
export const OUTPUT_SETTING = "output";

/** The setting that lists the API's output fixes. */
export const FIX_SETTING = "fix";

const LOCAL_REF_ROOT_SETTING = "localRefRoot";
const LOCAL_ROOT_EXPECTED = "a directory path or a file: URL";
const REMOTE_REF_HOSTS_SETTING = "remoteRefHosts";

/** `--content-never` is accepted and has no effect, as on the command line. */
const IGNORED_SETTINGS = ["contentNever"] as const;

const CAMEL_CASE_SETTINGS = [
  OUTPUT_SETTING,
  FIX_SETTING,
  LOCAL_REF_ROOT_SETTING,
  REMOTE_REF_HOSTS_SETTING,
  ...GENERATOR_FLAGS,
  ...IGNORED_SETTINGS,
];

const KNOWN_SETTINGS = new Set<string>([
  ...CAMEL_CASE_SETTINGS,
  ...CAMEL_CASE_SETTINGS.map((name) => kebabCase(name)),
]);

/** The warning for each setting of an API that no code reads. */
export function unknownSettingWarnings(apiName: string, settings: ApiSettings): string[] {
  return Object.keys(settings)
    .filter((key) => !KNOWN_SETTINGS.has(key))
    .map((key) =>
      warningText(
        `API ${apiName}: the setting \`${key}\` is not an openapi-typesafe option and is ignored`,
        WARNING_CODES.CONFIG_SETTING_UNKNOWN,
      ),
    );
}

/** The key a setting is written with: camelCase, else kebab-case; undefined when it is absent. */
function settingKey(settings: ApiSettings, name: string): string | undefined {
  if (name in settings) {
    return name;
  }
  const kebabName = kebabCase(name);
  return kebabName in settings ? kebabName : undefined;
}

/** The value of a setting in camelCase, else in kebab-case; `undefined` when it is absent. */
function settingValue(settings: ApiSettings, name: string): unknown {
  const key = settingKey(settings, name);
  return key === undefined ? undefined : settings[key];
}

function hasSetting(settings: ApiSettings, name: string): boolean {
  return settingKey(settings, name) !== undefined;
}

/** `CLI_CONFIG_INVALID` for the setting `name` of an API, named as the user wrote it. */
function invalidSetting(apiName: string, settings: ApiSettings, name: string, expected: string) {
  const key = settingKey(settings, name) ?? kebabCase(name);
  return cliError(
    "CLI_CONFIG_INVALID",
    `API ${apiName}: \`${key}\` in x-openapi-ts must be ${expected}`,
  );
}

/**
 * The boolean flags an API sets, in camelCase or kebab-case; they win over the CLI's flags. A
 * value of another type (`root-types: "true"`) fails with `CLI_CONFIG_INVALID`: ignoring it
 * would generate other types than the config asks for, without a word.
 */
export function apiFlags(apiName: string, settings: ApiSettings): GeneratorFlags {
  const flags: Partial<Record<(typeof GENERATOR_FLAGS)[number], boolean>> = {};
  for (const name of GENERATOR_FLAGS) {
    const value = settingValue(settings, name);
    if (typeof value === "boolean") {
      flags[name] = value;
    } else if (hasSetting(settings, name)) {
      throw invalidSetting(apiName, settings, name, "true or false");
    }
  }
  return flags;
}

/** The API's `output` file as written; fails with `CLI_CONFIG_INVALID` when it is not text. */
export function apiOutputOf(apiName: string, settings: ApiSettings): string {
  const output = settings[OUTPUT_SETTING];
  if (typeof output !== "string") {
    throw invalidSetting(apiName, settings, OUTPUT_SETTING, "a file path");
  }
  return output;
}

/**
 * The API's `fix` names, which replace the CLI's `--fix` (ADR-021). An entry that is not text
 * fails with `CLI_CONFIG_INVALID`; an unknown name with `OPTION_FIX_UNKNOWN`, naming the API.
 */
export function apiFixNames(
  apiName: string,
  settings: ApiSettings,
): readonly OutputFixName[] | undefined {
  if (!hasSetting(settings, FIX_SETTING)) {
    return undefined;
  }
  const entries = [settingValue(settings, FIX_SETTING)].flat();
  if (entries.some((entry) => typeof entry !== "string")) {
    throw invalidSetting(apiName, settings, FIX_SETTING, "a list of fix names or a comma list");
  }
  try {
    return fixNamesOf(entries);
  } catch (error) {
    throw new ApiFailure(apiName, error);
  }
}

/**
 * `local-ref-root: dir`, relative to the config file; empty means the config file's directory. A
 * value that is no text or a URL of another protocol fails with `CLI_CONFIG_INVALID`.
 */
function localRefRootOf(apiName: string, settings: ApiSettings, configRoot: URL): RefLimitOptions {
  if (!hasSetting(settings, LOCAL_REF_ROOT_SETTING)) {
    return {};
  }
  const value = settingValue(settings, LOCAL_REF_ROOT_SETTING) ?? "";
  const localRoot = typeof value === "string" ? localRootUrl(value, configRoot) : undefined;
  if (localRoot === undefined) {
    throw invalidSetting(apiName, settings, LOCAL_REF_ROOT_SETTING, LOCAL_ROOT_EXPECTED);
  }
  return { localRefRoot: localRoot };
}

/** `remote-ref-hosts: [a, b]` or `a,b`; an empty list or value allows no host. */
function remoteRefHostsOf(apiName: string, settings: ApiSettings): RefLimitOptions {
  if (!hasSetting(settings, REMOTE_REF_HOSTS_SETTING)) {
    return {};
  }
  const value = settingValue(settings, REMOTE_REF_HOSTS_SETTING) ?? [];
  const entries = [value].flat();
  if (entries.some((entry) => typeof entry !== "string")) {
    throw invalidSetting(apiName, settings, REMOTE_REF_HOSTS_SETTING, "a host list");
  }
  return { remoteRefHosts: hostList(entries) ?? [] };
}

/**
 * The `$ref` limits an API sets (threat model R1, R2). Each one replaces the CLI flag of the same
 * name for this API, as its boolean settings and `fix` do; fails with `CLI_CONFIG_INVALID` for a
 * value of another type.
 */
export function apiRefLimitOptions(
  apiName: string,
  settings: ApiSettings,
  configRoot: URL,
): RefLimitOptions {
  return {
    ...localRefRootOf(apiName, settings, configRoot),
    ...remoteRefHostsOf(apiName, settings),
  };
}
