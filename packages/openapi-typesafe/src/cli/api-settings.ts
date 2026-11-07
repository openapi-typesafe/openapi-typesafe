import { kebabCase } from "scule";
import { WARNING_CODES, warningText } from "../domain/warnings.js";
import { GENERATOR_FLAGS, hostList } from "./cli-arguments.js";
import { cliError } from "./cli-errors.js";
import { resolveLocationUrl } from "./cli-output.js";
import type { RefLimitOptions } from "./ref-limits.js";

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

/** The value of a setting in camelCase, else in kebab-case; `undefined` when it is absent. */
function settingValue(settings: ApiSettings, name: string): unknown {
  return name in settings ? settings[name] : settings[kebabCase(name)];
}

function hasSetting(settings: ApiSettings, name: string): boolean {
  return name in settings || kebabCase(name) in settings;
}

function invalidSetting(apiName: string, name: string, expected: string): Error {
  return cliError(
    "CLI_CONFIG_INVALID",
    `API ${apiName}: \`${kebabCase(name)}\` in x-openapi-ts must be ${expected}`,
  );
}

/** `local-ref-root: dir`, relative to the config file; empty means the config file's directory. */
function localRefRootOf(apiName: string, settings: ApiSettings, configRoot: URL): RefLimitOptions {
  if (!hasSetting(settings, LOCAL_REF_ROOT_SETTING)) {
    return {};
  }
  const value = settingValue(settings, LOCAL_REF_ROOT_SETTING) ?? "";
  if (typeof value !== "string") {
    throw invalidSetting(apiName, LOCAL_REF_ROOT_SETTING, "a directory path");
  }
  return { localRefRoot: resolveLocationUrl(value === "" ? "." : value, configRoot) };
}

/** `remote-ref-hosts: [a, b]` or `a,b`; an empty list or value allows no host. */
function remoteRefHostsOf(apiName: string, settings: ApiSettings): RefLimitOptions {
  if (!hasSetting(settings, REMOTE_REF_HOSTS_SETTING)) {
    return {};
  }
  const value = settingValue(settings, REMOTE_REF_HOSTS_SETTING) ?? [];
  const entries = [value].flat();
  if (entries.some((entry) => typeof entry !== "string")) {
    throw invalidSetting(apiName, REMOTE_REF_HOSTS_SETTING, "a host list");
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
