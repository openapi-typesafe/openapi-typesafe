import { kebabCase } from "scule";
import type { RedoclyConfig } from "../application/ports/redocly-config-source.js";
import type { OutputFixName } from "../domain/output-fixes.js";
import type { GeneratorOptions } from "../types.js";
import { GENERATOR_FLAGS, type GeneratorFlags } from "./cli-arguments.js";
import { cliError } from "./cli-errors.js";
import { type CliRun, emitOutput, resolveFileUrl } from "./cli-output.js";
import { MULTIPLE_SCHEMAS_DOCS_URL } from "./docs-links.js";
import { fixNamesOf, fixOption } from "./fix-option.js";
import { refLimitOptions } from "./ref-limits.js";

/** The `apis` of a Redocly config: each API is generated into its `x-openapi-ts.output`. */

/** The key of an API's openapi-typesafe settings in `redocly.yaml`. */
const REDOCLY_CONFIG_KEY = "x-openapi-ts";

/** The setting of an API that lists its output fixes. */
const FIX_SETTING = "fix";

type ApiSettings = Readonly<Record<string, unknown>>;

interface RedoclyApi {
  readonly name: string;
  readonly root: string;
  readonly settings: ApiSettings | undefined;
}

function redoclyApisOf(redocly: RedoclyConfig): RedoclyApi[] {
  return Object.entries(redocly.apis ?? {}).map(([name, api]) => {
    const settings = (api as Record<string, unknown>)[REDOCLY_CONFIG_KEY];
    return { name, root: api.root, settings: settings as ApiSettings | undefined };
  });
}

export function hasRedoclyApis(redocly: RedoclyConfig): boolean {
  return Object.keys(redocly.apis ?? {}).length > 0;
}

/** The boolean flags an API sets, in camelCase or kebab-case; they win over the CLI's flags. */
function apiFlags(settings: ApiSettings): GeneratorFlags {
  const flags: Partial<Record<(typeof GENERATOR_FLAGS)[number], boolean>> = {};
  for (const name of GENERATOR_FLAGS) {
    const value = typeof settings[name] === "boolean" ? settings[name] : settings[kebabCase(name)];
    if (typeof value === "boolean") {
      flags[name] = value;
    }
  }
  return flags;
}

/** The API's `fix` names; they replace the CLI's `--fix`, as its boolean settings win (ADR-021). */
function apiFixNames(settings: ApiSettings): readonly OutputFixName[] | undefined {
  return fixNamesOf(settings[FIX_SETTING]);
}

/** Paths in the config are relative to the config file; without a file, to the working dir. */
function configRootOf(redocly: RedoclyConfig, cwd: URL): URL {
  return redocly.configFile ? resolveFileUrl(redocly.configFile, cwd) : cwd;
}

async function generateApi(run: CliRun, redocly: RedoclyConfig, api: RedoclyApi): Promise<void> {
  if (!api.settings?.output) {
    throw cliError(
      "CLI_CONFIG_OUTPUT_MISSING",
      `API ${api.name} is missing an \`${REDOCLY_CONFIG_KEY}.output\` key. ` +
        `See ${MULTIPLE_SCHEMAS_DOCS_URL}`,
    );
  }
  const output = String(api.settings.output);
  const configRoot = configRootOf(redocly, run.deps.cwd);
  const options: GeneratorOptions = {
    ...run.args.generatorFlags,
    ...apiFlags(api.settings),
    ...refLimitOptions(run.args, run.deps.cwd),
    ...fixOption(apiFixNames(api.settings) ?? run.args.fix),
    redocly,
  };
  const contents = await run.deps.generate(new URL(api.root, configRoot), options);
  emitOutput(run, { source: api.name, output, file: new URL(output, configRoot) }, contents);
}

/**
 * Generate every API of the config, concurrently. Every API is generated or checked even when
 * another fails, so `--check` reports a stale output wherever it is; the failures are returned
 * in the order of the config.
 */
export async function generateRedoclyApis(run: CliRun, redocly: RedoclyConfig): Promise<unknown[]> {
  const apis = redoclyApisOf(redocly);
  const results = await Promise.allSettled(apis.map((api) => generateApi(run, redocly, api)));
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}
